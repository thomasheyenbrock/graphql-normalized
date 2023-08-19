import {
  ArgumentNode,
  DirectiveNode,
  FieldNode,
  FragmentSpreadNode,
  InlineFragmentNode,
  Kind,
  ObjectFieldNode,
  SelectionNode,
  ValueNode,
} from "graphql";

export function selectionsAreEquivalent(
  a: SelectionNode,
  b: SelectionNode,
): boolean {
  switch (a.kind) {
    case Kind.FIELD:
      return b.kind === Kind.FIELD ? fieldsAreEquivalent(a, b) : false;
    case Kind.INLINE_FRAGMENT:
      return b.kind === Kind.INLINE_FRAGMENT
        ? inlineFragmentsAreEquivalent(a, b)
        : false;
    case Kind.FRAGMENT_SPREAD:
      return b.kind === Kind.FRAGMENT_SPREAD
        ? fragmentSpreadsAreEquivalent(a, b)
        : false;
  }
}

export function fieldsAreEquivalent(a: FieldNode, b: FieldNode): boolean {
  if ((a.alias?.value ?? a.name.value) !== (b.alias?.value ?? b.name.value))
    return false;
  if (!argumentsAreEquivalent(a.arguments, b.arguments)) return false;
  if (!directivesAreEquivalent(a.directives, b.directives)) return false;
  return true;
}

export function inlineFragmentsAreEquivalent(
  a: InlineFragmentNode,
  b: InlineFragmentNode,
): boolean {
  if (a.typeCondition) {
    if (!b.typeCondition) return false;
    if (a.typeCondition.name.value !== b.typeCondition.name.value) return false;
  } else {
    if (b.typeCondition) return false;
  }
  if (!directivesAreEquivalent(a.directives, b.directives)) return false;
  return true;
}

export function fragmentSpreadsAreEquivalent(
  a: FragmentSpreadNode,
  b: FragmentSpreadNode,
): boolean {
  if (a.name.value !== b.name.value) return false;
  if (!directivesAreEquivalent(a.directives, b.directives)) return false;
  return true;
}

function directivesAreEquivalent(
  a: readonly DirectiveNode[] | undefined = [],
  b: readonly DirectiveNode[] | undefined = [],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name.value !== b[i].name.value) return false;
    if (!argumentsAreEquivalent(a[i].arguments, b[i].arguments)) return false;
  }
  return true;
}

function argumentsAreEquivalent(
  a: readonly ArgumentNode[] | undefined = [],
  b: readonly ArgumentNode[] | undefined = [],
): boolean {
  if (a.length !== b.length) return false;

  const bMap: Record<string, ArgumentNode> = Object.create(null);
  for (const arg of b) bMap[arg.name.value] = arg;

  for (let i = 0; i < a.length; i++) {
    const bArg = bMap[a[i].name.value];
    if (!bArg) return false;
    if (!valuesAreEquivalent(a[i].value, bArg.value)) return false;
  }

  return true;
}

function valuesAreEquivalent(a: ValueNode, b: ValueNode): boolean {
  if (a.kind === Kind.VARIABLE && b.kind === Kind.VARIABLE)
    return a.name.value === b.name.value;

  if (a.kind === Kind.INT && b.kind === Kind.INT) return a.value === b.value;

  if (a.kind === Kind.FLOAT && b.kind === Kind.FLOAT)
    return a.value === b.value;

  if (a.kind === Kind.STRING && b.kind === Kind.STRING)
    return a.value === b.value;

  if (a.kind === Kind.BOOLEAN && b.kind === Kind.BOOLEAN)
    return a.value === b.value;

  if (a.kind === Kind.NULL && b.kind === Kind.NULL) return true;

  if (a.kind === Kind.ENUM && b.kind === Kind.ENUM) return a.value === b.value;

  if (a.kind === Kind.LIST && b.kind === Kind.LIST) {
    if (a.values.length !== b.values.length) return false;
    for (let i = 0; i < a.values.length; i++) {
      if (!valuesAreEquivalent(a.values[i], b.values[i])) return false;
    }
    return true;
  }

  if (a.kind === Kind.OBJECT && b.kind === Kind.OBJECT) {
    if (a.fields.length !== b.fields.length) return false;

    const bMap: Record<string, ObjectFieldNode> = Object.create(null);
    for (const field of b.fields) bMap[field.name.value] = field;

    for (let i = 0; i < a.fields.length; i++) {
      const bField = bMap[a.fields[i].name.value];
      if (!bField) return false;
      if (!valuesAreEquivalent(a.fields[i].value, bField.value)) return false;
    }

    return true;
  }
  return false;
}
