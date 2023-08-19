import {
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
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
  parse,
  print,
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
 * Handles 2.1.2, and 2.1.6
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
        let hasMadeChange = false;
        do {
          const result = removeDuplicateSelections(node);
          const parentSelectionSet = result.selectionSet;
          hasMadeChange = result.hasMadeChange;

          const type = typeInfo.getType();
          if (!isInterfaceType(type)) return parentSelectionSet;

          for (let i = 0; i < parentSelectionSet.selections.length; i++) {
            const currentSelection = parentSelectionSet.selections[i];
            if (currentSelection.kind === Kind.INLINE_FRAGMENT) {
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
                } else {
                  inlineFragmentSelections.push(selection);
                }
              }
              currentSelection.selectionSet.selections =
                inlineFragmentSelections;
            }
          }

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
