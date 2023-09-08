import {
  DirectiveNode,
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  GraphQLInterfaceType,
  GraphQLSchema,
  InlineFragmentNode,
  Kind,
  Lexer,
  SelectionNode,
  SelectionSetNode,
  Source,
  StringValueNode,
  TokenKind,
  TypeInfo,
  isInterfaceType,
  isObjectType,
  parse,
  print,
  specifiedDirectives,
  visit,
  visitWithTypeInfo,
} from "graphql";
import { selectionsAreEquivalent } from "./equivalence";
import { isPunctuatorTokenKind } from "graphql/language/lexer";
import { selectionsAreEqual } from "./equality";

export function normalize(
  source: string | DocumentNode,
  schema: GraphQLSchema,
): DocumentNode {
  let ast =
    typeof source === "string" ? parse(source, { noLocation: true }) : source;

  ast = inlineFragments(ast);
  ast = removeRedundantTypeConditions(ast, schema);
  ast = flattenSelections(ast);
  ast = deduplicateSelections(ast, schema);
  ast = removeBlockStrings(ast);

  return ast;
}

/**
 * Handles 2.1.3
 */
function inlineFragments(ast: DocumentNode): DocumentNode {
  const fragmentMap: Record<string, FragmentDefinitionNode> =
    Object.create(null);
  ast = {
    kind: Kind.DOCUMENT,
    definitions: ast.definitions.filter((definition) => {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        fragmentMap[definition.name.value] = definition;
        return false;
      }
      return true;
    }),
  };

  return visit(ast, {
    FragmentSpread(node): InlineFragmentNode {
      const fragment = fragmentMap[node.name.value];
      if (!fragment)
        throw new Error(`Fragment ${node.name.value} is not defined`);
      return {
        kind: Kind.INLINE_FRAGMENT,
        typeCondition: fragment.typeCondition,
        directives: node.directives,
        selectionSet: fragment.selectionSet,
      };
    },
  });
}

/**
 * Handles 2.1.4
 */
function removeRedundantTypeConditions(
  ast: DocumentNode,
  schema: GraphQLSchema,
): DocumentNode {
  const typeInfo = new TypeInfo(schema);

  return visit(
    ast,
    visitWithTypeInfo(typeInfo, {
      InlineFragment(node): InlineFragmentNode | void {
        if (!node.typeCondition) return;
        const type = typeInfo.getParentType();
        if (type && type.name === node.typeCondition.name.value) {
          return {
            kind: Kind.INLINE_FRAGMENT,
            directives: node.directives,
            selectionSet: node.selectionSet,
          };
        }
      },
    }),
  );
}

/**
 * Handles 2.1.1, 2.1.5, 2.1.10, and 2.1.11
 */
function flattenSelections(ast: DocumentNode): DocumentNode {
  return visit(ast, {
    Field(node): FieldNode | void {
      if (node.alias && node.alias.value === node.name.value) {
        return {
          kind: Kind.FIELD,
          name: node.name,
          arguments: node.arguments,
          directives: node.directives,
          selectionSet: node.selectionSet,
        };
      }
    },
    SelectionSet: {
      leave(node): SelectionSetNode | void {
        const selections: SelectionNode[] = [];
        for (let i = 0; i < node.selections.length; i++) {
          const s = node.selections[i];

          if (s.kind !== Kind.INLINE_FRAGMENT) {
            selections.push(s);
            continue;
          }

          if (!s.typeCondition) {
            if (!s.directives?.length) {
              selections.push(...s.selectionSet.selections);
              continue;
            }

            const skipDirective = s.directives?.find(
              (directive) => directive.name.value === "skip",
            );
            if (skipDirective) {
              const ifArgValue = skipDirective.arguments?.find(
                (arg) => arg.name.value === "if",
              )?.value;
              if (ifArgValue?.kind === Kind.BOOLEAN) {
                if (!ifArgValue.value) {
                  selections.push(...s.selectionSet.selections);
                }
                continue;
              }
            }

            const includeDirective = s.directives?.find(
              (directive) => directive.name.value === "include",
            );
            if (includeDirective) {
              const ifArgValue = includeDirective.arguments?.find(
                (arg) => arg.name.value === "if",
              )?.value;
              if (ifArgValue?.kind === Kind.BOOLEAN) {
                if (ifArgValue.value) {
                  selections.push(...s.selectionSet.selections);
                }
                continue;
              }
            }
          }

          selections.push(s);
        }
        return { kind: Kind.SELECTION_SET, selections };
      },
    },
  });
}

/**
 * Handles 2.1.2, 2.1.6, 2.1.7, 2.1.8, and 2.1.9
 */
function deduplicateSelections(
  ast: DocumentNode,
  schema: GraphQLSchema,
): DocumentNode {
  const typeInfo = new TypeInfo(schema);
  return visit(
    ast,
    visitWithTypeInfo(typeInfo, {
      SelectionSet(node): SelectionSetNode {
        const type = typeInfo.getType();

        let hasMadeChange = false;
        do {
          const result = removeDuplicateSelections(node);
          const parentSelectionSet = result.selectionSet;
          hasMadeChange = result.hasMadeChange;

          if (!isInterfaceType(type)) {
            node = parentSelectionSet;
            continue;
          }

          for (let i = 0; i < parentSelectionSet.selections.length; i++) {
            const currentSelection = parentSelectionSet.selections[i];
            if (
              currentSelection.kind === Kind.INLINE_FRAGMENT &&
              !hasCustomDirective(currentSelection.directives)
            ) {
              const inlineFragmentSelections: SelectionNode[] = [];
              for (
                let j = 0;
                j < currentSelection.selectionSet.selections.length;
                j++
              ) {
                const selection = currentSelection.selectionSet.selections[j];

                if (
                  selectionIsLeadingRedundant(selection, parentSelectionSet, i)
                ) {
                  hasMadeChange = true;
                  continue;
                }

                if (
                  selectionIsLaggingRedundant(
                    selection,
                    parentSelectionSet,
                    i,
                    j,
                  )
                ) {
                  const parentSelections = [...parentSelectionSet.selections];
                  const nextSelection = parentSelections.splice(i + 1, 1);
                  parentSelections.splice(i, 0, ...nextSelection);
                  parentSelectionSet.selections = parentSelections;

                  hasMadeChange = true;
                  continue;
                }

                inlineFragmentSelections.push(selection);
              }

              for (let j = inlineFragmentSelections.length - 1; j >= 0; j--) {
                const selections = inlineFragmentSelections.slice(
                  j,
                  inlineFragmentSelections.length,
                );
                if (
                  selectionListIsLaggingRedundant(
                    selections,
                    parentSelectionSet,
                    i,
                  )
                ) {
                  inlineFragmentSelections.splice(j);
                  hasMadeChange = true;
                }
              }

              currentSelection.selectionSet.selections =
                inlineFragmentSelections;
            }
          }

          let fragments: InlineFragmentNode[] = [];
          let startIndex = -1;
          for (let i = 0; i < parentSelectionSet.selections.length; i++) {
            const selection = parentSelectionSet.selections[i];
            if (
              selection.kind !== Kind.INLINE_FRAGMENT ||
              hasCustomDirective(selection.directives)
            ) {
              fragments = [];
              startIndex = -1;
              continue;
            }

            if (startIndex === -1) startIndex = i;
            fragments.push(selection);
            if (!fragmentsAreExhaustive(fragments, type, schema)) continue;

            if (fragmentsContainEqualSelectionAt(fragments, "first")) {
              const selection = fragments[0].selectionSet.selections[0];

              for (let j = 0; j < fragments.length; j++) {
                const fragment = fragments[j];
                fragment.selectionSet.selections =
                  fragment.selectionSet.selections.slice(1);
              }

              const parentSelections = [...parentSelectionSet.selections];
              parentSelections.splice(startIndex, 0, selection);
              parentSelectionSet.selections = parentSelections;

              hasMadeChange = true;
              break;
            }

            if (fragmentsContainEqualSelectionAt(fragments, "last")) {
              const selection =
                fragments[0].selectionSet.selections[
                  fragments[0].selectionSet.selections.length - 1
                ];

              for (let j = 0; j < fragments.length; j++) {
                const fragment = fragments[j];
                fragment.selectionSet.selections =
                  fragment.selectionSet.selections.slice(0, -1);
              }

              const parentSelections = [...parentSelectionSet.selections];
              parentSelections.splice(i + 1, 0, selection);
              parentSelectionSet.selections = parentSelections;

              hasMadeChange = true;
              break;
            }
          }

          parentSelectionSet.selections = [
            ...parentSelectionSet.selections,
          ].filter(
            (selection) =>
              selection.kind !== Kind.INLINE_FRAGMENT ||
              selection.selectionSet.selections.length > 0,
          );

          node = parentSelectionSet;
        } while (hasMadeChange);

        return node;
      },
    }),
  );
}

/**
 * Handles 1.1.2
 */
function removeBlockStrings(ast: DocumentNode): DocumentNode {
  return visit(ast, {
    StringValue(node): StringValueNode {
      return { ...node, block: false };
    },
  });
}

/**
 * Handles 1.1.1
 */
export function normalizedPrint(document: DocumentNode | string) {
  const printed = typeof document === "string" ? document : print(document);
  const sourceObj = new Source(printed);
  const body = sourceObj.body;
  const lexer = new Lexer(sourceObj);
  let strippedBody = "";
  let wasLastAddedTokenNonPunctuator = false;

  while (lexer.advance().kind !== TokenKind.EOF) {
    const currentToken = lexer.token;
    const isNonPunctuator = !isPunctuatorTokenKind(currentToken.kind);

    if (wasLastAddedTokenNonPunctuator) {
      if (isNonPunctuator || currentToken.kind === TokenKind.SPREAD) {
        strippedBody += " ";
      }
    }

    strippedBody += body.slice(currentToken.start, currentToken.end);

    wasLastAddedTokenNonPunctuator = isNonPunctuator;
  }

  return strippedBody;
}

function removeDuplicateSelections(selectionSet: SelectionSetNode): {
  selectionSet: SelectionSetNode;
  hasMadeChange: boolean;
} {
  let hasMadeChange = false;

  const selections: (FieldNode | InlineFragmentNode)[] = [];

  for (let i = 0; i < selectionSet.selections.length; i++) {
    const s = selectionSet.selections[i] as FieldNode | InlineFragmentNode;

    let hasEquivalent = false;
    for (let j = 0; j < selections.length; j++) {
      const s2 = selections[j];
      if (selectionsAreEquivalent(s, s2)) {
        if (s2.selectionSet) {
          selections[j] = {
            ...s2,
            selectionSet: {
              ...s2.selectionSet,
              selections: [
                ...s2.selectionSet.selections,
                ...((s as FieldNode).selectionSet?.selections || []),
              ],
            },
          };
        }
        hasEquivalent = true;
        break;
      }
    }

    if (hasEquivalent) {
      hasMadeChange = true;
    } else {
      selections.push(s);
    }
  }

  return {
    selectionSet: { kind: Kind.SELECTION_SET, selections },
    hasMadeChange,
  };
}

function selectionIsLeadingRedundant(
  selection: SelectionNode,
  parentSelectionSet: SelectionSetNode,
  index: number,
): boolean {
  for (let i = 0; i < index; i++) {
    const parentSelection = parentSelectionSet.selections[i];
    if (selectionsAreEqual(selection, parentSelection)) return true;
  }
  return false;
}

function selectionIsLaggingRedundant(
  selection: SelectionNode,
  parentSelectionSet: SelectionSetNode,
  parentIndex: number,
  index: number,
): boolean {
  if (index !== 0) return false;

  const nextSelection = parentSelectionSet.selections[parentIndex + 1];
  if (!nextSelection) return false;

  return selectionsAreEqual(selection, nextSelection);
}

function selectionListIsLaggingRedundant(
  selections: SelectionNode[],
  parentSelectionSet: SelectionSetNode,
  parentIndex: number,
): boolean {
  const nextSelections = parentSelectionSet.selections.slice(
    parentIndex + 1,
    parentIndex + 1 + selections.length,
  );
  if (nextSelections.length !== selections.length) return false;

  for (let i = 0; i < selections.length; i++) {
    const selection = selections[i];
    const nextSelection = nextSelections[i];
    if (!selectionsAreEqual(selection, nextSelection)) return false;
  }

  return true;
}

function fragmentsContainEqualSelectionAt(
  fragments: InlineFragmentNode[],
  position: "first" | "last",
): boolean {
  const firstSelections = fragments[0].selectionSet.selections;
  if (!firstSelections || firstSelections.length === 0) return false;

  const expected =
    firstSelections[position === "first" ? 0 : firstSelections.length - 1];

  for (let i = 1; i < fragments.length; i++) {
    const selections = fragments[i].selectionSet.selections;
    if (!selections || selections.length === 0) return false;

    const selection =
      selections[position === "first" ? 0 : selections.length - 1];
    if (!selectionsAreEqual(selection, expected)) return false;
  }
  return true;
}

function fragmentsAreExhaustive(
  fragments: InlineFragmentNode[],
  interfaceType: GraphQLInterfaceType,
  schema: GraphQLSchema,
): boolean {
  const fragmentTypes = new Set<string>();
  for (const fragment of fragments) {
    const typeName = fragment.typeCondition?.name.value;
    if (!typeName) continue;

    const type = schema.getType(typeName);
    if (isObjectType(type)) {
      fragmentTypes.add(type.name);
    } else if (isInterfaceType(type)) {
      for (const t of implementors(type, schema)) fragmentTypes.add(t);
    }
  }

  for (const implementor of implementors(interfaceType, schema)) {
    if (!fragmentTypes.has(implementor)) return false;
  }

  return true;
}

function implementors(
  interfaceType: GraphQLInterfaceType,
  schema: GraphQLSchema,
): Set<string> {
  const { objects, interfaces } = schema.getImplementations(interfaceType);

  const objectImplementors = new Set<string>(
    objects.map((object) => object.name),
  );

  for (const i of interfaces) {
    for (const t of implementors(i, schema)) objectImplementors.add(t);
  }

  return objectImplementors;
}

function hasCustomDirective(
  directives: readonly DirectiveNode[] | undefined = [],
): boolean {
  return directives.some(
    (directive) => !SPECIFIED_DIRECTIVE_NAMES.includes(directive.name.value),
  );
}

const SPECIFIED_DIRECTIVE_NAMES = specifiedDirectives.map(
  (directive) => directive.name,
);
