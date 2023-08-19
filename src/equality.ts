import {
  FieldNode,
  InlineFragmentNode,
  Kind,
  SelectionNode,
  SelectionSetNode,
} from "graphql";
import {
  fieldsAreEquivalent,
  fragmentSpreadsAreEquivalent,
  inlineFragmentsAreEquivalent,
} from "./equivalence";

export function selectionsAreEqual(
  selectionA: SelectionNode,
  selectionB: SelectionNode,
): boolean {
  if (selectionA.kind === Kind.FIELD && selectionB.kind === Kind.FIELD) {
    return fieldsAreEqual(selectionA, selectionB);
  }

  if (
    selectionA.kind === Kind.INLINE_FRAGMENT &&
    selectionB.kind === Kind.INLINE_FRAGMENT
  ) {
    return inlineFragmentsAreEqual(selectionA, selectionB);
  }

  if (
    selectionA.kind === Kind.FRAGMENT_SPREAD &&
    selectionB.kind === Kind.FRAGMENT_SPREAD
  ) {
    return fragmentSpreadsAreEquivalent(selectionA, selectionB);
  }

  return false;
}

function fieldsAreEqual(fieldA: FieldNode, fieldB: FieldNode): boolean {
  if (!fieldsAreEquivalent(fieldA, fieldB)) return false;

  const selectionSetA = fieldA.selectionSet;
  const selectionSetB = fieldB.selectionSet;

  if (!selectionSetA) return !selectionSetB;
  if (!selectionSetB) return false;

  return selectionSetsAreEqual(selectionSetA, selectionSetB);
}

function inlineFragmentsAreEqual(
  inlineFragmentA: InlineFragmentNode,
  inlineFragmentB: InlineFragmentNode,
): boolean {
  if (!inlineFragmentsAreEquivalent(inlineFragmentA, inlineFragmentB))
    return false;

  return selectionSetsAreEqual(
    inlineFragmentA.selectionSet,
    inlineFragmentB.selectionSet,
  );
}

function selectionSetsAreEqual(
  selectionSetA: SelectionSetNode,
  selectionSetB: SelectionSetNode,
): boolean {
  if (selectionSetA.selections.length !== selectionSetB.selections.length)
    return false;

  for (let i = 0; i < selectionSetA.selections.length; i++) {
    const selectionA = selectionSetA.selections[i];
    const selectionB = selectionSetB.selections[i];
    if (!selectionsAreEqual(selectionA, selectionB)) return false;
  }

  return true;
}
