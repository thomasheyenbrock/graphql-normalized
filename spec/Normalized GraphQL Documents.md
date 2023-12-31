# Normalized GraphQL Documents

**State of this document**

This specification shall be considered a working draft. The authors of this
document reserve the right to make changes of any kind without notice. This
includes changes that are not backward compattible.

In the future, there will exists ratified versions of this specification. Each
version will be immutable and won't receive any further changes.

Changes between versions may not always be backwards compatible. However, it is
the intent of the authors of this specification to minimize the amount of
changes that are not backward compatible.

**Introduction**

GraphQL as a language is intentionally designed to give maximum flexibility to
API consumers. This means that there are infinite possible ways for the same
[execution result](<https://spec.graphql.org/October2021/#ExecuteRequest()>) to
be produced by different query documents, given the same variables as inputs.

A similar thing can be said about the
[type system definition language](https://spec.graphql.org/October2021/#sec-Type-System)
defined by the GraphQL specification. A single GraphQL schema can be defined
using infinite different representation of that language.

This specification intends to formalize a method of normalizing any GraphQL
document. This includes both
[executable documents](https://spec.graphql.org/October2021/#ExecutableDocument)
as well as
[type system documents](https://spec.graphql.org/October2021/#TypeSystemDocument).
Two documents that generate the same execution result or that describe the same
GraphQL schema will generate the same output when following the normalization
procedures defined by this specification.

**Usage**

The primary motivation for writing this specifications is persisted operations,
where instead of sending the full document to a GraphQL server for execution,
the server instead receives a hash that can be uniquely mapped to a certain
operation. For efficiency reasons, two operations should produce the same hash
if they are semantically equivalent. Without being able to normalize GraphQL
documents, the server needs to store multiple hashes for equivalent operations.

For example, the following two documents would produce the same execution
result, yet their stringified versions are different, hence they would result in
different values when being hashes.

```graphql example
{
  user(id: 4) {
    name
  }
}
```

```graphql example
{
  user(id: 4) {
    ...UserData
  }
}

fragment UserData on User {
  name
}
```

There are likely more use cases for normalizing GraphQL documents which this
preface might include in the future.

## Overview

Defining normalization for GraphQL documents only refers to the textual
representation or the AST derived from the textual representation. This
specification makes no assumptions of how GraphQL server implementations should
handle documents internally.

All the following sections define a set of rules. A GraphQL document is
considered normalized if any only if it adheres to all these rules.

### Printing Normalized GraphQL Documents

The stringified display of normalized GraphQL documents optimizes for string
length as a primary goal and legibility as secondary goal. The string must use
UTF-8 for encoding.

#### Minimize ignored tokens

To meet the primary goal of small length, a normalized GraphQL document in
stringified form must not contain excessive
[ignored tokens](https://spec.graphql.org/October2021/#sec-Language.Source-Text.Ignored-Tokens).
The only non-excessive ignored token is a single space character (U+0020) that
must be inserted between two tokens for which {ShouldSeparateWithSpace} returns
**true**.

ShouldSeparateWithSpace(firstToken, secondToken) :

1. If {secondToken} is of the kind
   _[Punctuator](https://spec.graphql.org/October2021/#Punctuator)_ and is equal
   to the tripple-dot (**...**):
   - If {firstToken} is a
     [lexical token](https://spec.graphql.org/October2021/#Token) and not of the
     kind _[Punctuator](https://spec.graphql.org/October2021/#Punctuator)_:
     - Return **true**.
   - Return **false**.
1. If {firstToken} is a
   [lexical token](https://spec.graphql.org/October2021/#Token) and not of the
   kind _[Punctuator](https://spec.graphql.org/October2021/#Punctuator)_:
   - If {secondToken} is a
     [lexical token](https://spec.graphql.org/October2021/#Token) and not of the
     kind _[Punctuator](https://spec.graphql.org/October2021/#Punctuator)_:
     - Return **true**.
1. Return **false**.

Note: The definition of {ShouldSeparateWithSpace} intentionally adds ignored
tokens in _some_ places where they would not strictly be necessary in order to
produce a string that can be parsed as GraphQL document. This is to satisfy the
secondary goal of legibility.

**Example**

Consider the following document string that contains excessive ingored tokens.

```graphql example
{
  add(numbers: [1, -2]) {
    __typename
    ... on Success {
      result
    }
    ... on Error {
      message
      code
    }
  }
}
```

The string correctly representing the normalized GraphQL document looks like
this.

```example
{add(numbers:[1 -2]){__typename ...on Success{result}...on Error{message code}}}
```

There are two space tokens in this string which are not strictly necessary to
preserve the ability of the string to be parsed as GraphQL document:

- The space between `1` and `-2` in the integer array
- The space between `__typename` and the tripple-dot punctuator `...`

In other words, the following string contains the actually minimal amount of
ignored tokens and would parse to the same GraphQL document like the one above.

```counter-example
{add(numbers:[1-2]){__typename...on Success{result}...on Error{message code}}}
```

The second string suffers significantly in terms of legibility. For a human, the
token `1-2` might not be understood as two separate integers. Similarly, having
the tripple-dot punctuator join two
_[Name](https://spec.graphql.org/October2021/#Name)_ tokens might be considered
ambiguous or might be perceived as a single
_[Name](https://spec.graphql.org/October2021/#Name)_ token.

#### Printing strings

There are two ways of representing a
_[StringValue](https://spec.graphql.org/October2021/#StringValue)_ in GraphQL:
Wrapping the string with two single-quotation-marks, and wrapping the string
with two tripple-quotation-marks. The latter are known as
_[block strings](https://spec.graphql.org/October2021/#sec-String-Value.Block-Strings)_.
We will refer to the former as _regular strings_.

When displaying a normalized GraphQL document in stringified form, all
_[StringValue](https://spec.graphql.org/October2021/#StringValue)_ tokens must
be printed as regular strings.

Note: The reason for using regular strings over block strings is to meet the
primary goal of minimized overall string length. A block string requires four
additional quotation marks. Line breaks could be inserted more efficiently using
block strings (using U+000A as single character), however this conflicts with
the secondary goal of legibility (see below).

The following control characters must be printed using their escape sequence:

- U+0008 must be printed as `\b`
- U+0009 must be printed as `\t`
- U+000A must be printed as `\n`
- U+000C must be printed as `\f`
- U+000D must be printed as `\r`

All control characters other than the five mentioned above must be printed using
their escaped unicode sequence. This includes:

- All characters from U+0000 up to and including U+0007
- The character U+000B
- All characters from U+000E up to and including U+001F
- All characters from U+007F up to and including U+009F

The quote character U+0022 must be printed with a leading backslash (`\"`).

The backslash character U+005C must be printed with a leading backslash (`\\`).

All other characters must be printed using their unicode character.

## Executable Documents

This section contains normalization rules specifically for
_[ExecutableDocuments](https://spec.graphql.org/October2021/#ExecutableDocument)_.
Each rule provides a non-normalized GraphQL document as counter-example and
shows the normalized version of that document.

Note: Like described in the section about
[Printing Normalized GraphQL Documents](#sec-Printing-Normalized-GraphQL-Documents),
normalized GraphQL documents in textual representation must not contain
excessive ignored tokens. However, to increase legibility, the examples of this
section use a "prettified" textual representation that may add ignored tokens
such as whitespace, line terminators, and commatas.

This specification only applies to _executable documents_ that would produce no
[validation](https://spec.graphql.org/October2021/#sec-Validation) errors in the
context of a given GraphQL schema.

### Selections

#### No Redundant Field Alias

A normalized GraphQL document must not contain a
_[Field](https://spec.graphql.org/October2021/#Field)_ with an
_[Alias](https://spec.graphql.org/October2021/#Alias)_ that has the same name as
the field.

**Example**

```graphql counter-example
{
  user(id: 4) {
    name: name
  }
}
```

```graphql example
{
  user(id: 4) {
    name
  }
}
```

#### No Duplicate Selections

A normalized GraphQL document must not contain two equivalent
_[Selections](https://spec.graphql.org/October2021/#Selection)_. Two
_[Selections](https://spec.graphql.org/October2021/#Selection)_ _selectionA_ and
_selectionB_ are considered equivalent if {SelectionsAreEquivalent(selectionA,
selectionB)} is equal to **true**.

Note: Within the process of normalizing a GraphQL document and removing
duplicate selections, it is important to preserve the given
[field ordering](https://spec.graphql.org/October2021/#sec-Objects.Field-Ordering).
This implies that when finding two equivalent selections, then the one specified
second should be removed in favor of the one specified first.

SelectionsAreEquivalent(selectionA, selectionB) :

1. If {selectionA} is a _[Field](https://spec.graphql.org/October2021/#Field)_:
   - If {selectionB} is not a
     _[Field](https://spec.graphql.org/October2021/#Field)_:
     - Return **false**.
   - Otherwise, return {FieldsAreEquivalent(selectionA, selectionB)}.
1. If {selectionA} is an
   _[InlineFragment](https://spec.graphql.org/October2021/#InlineFragment)_:
   - If {selectionB} is not an
     _[InlineFragment](https://spec.graphql.org/October2021/#InlineFragment)_:
     - Return **false**.
   - Otherwise, return {InlineFragmentsAreEquivalent(selectionA, selectionB)}.
1. If {selectionA} is a
   _[FragmentSpread](https://spec.graphql.org/October2021/#FragmentSpread)_:
   - If {selectionB} is not a
     _[FragmentSpread](https://spec.graphql.org/October2021/#FragmentSpread)_:
     - Return **false**.
   - Otherwise, return {FragmentSpreadsAreEqual(selectionA, selectionB)}.

FieldsAreEquivalent(fieldA, fieldB) :

1. Let {responseKeyA} be the response key of {fieldA}
   (_[Alias](https://spec.graphql.org/October2021/#Alias)_ if exists, otherwise
   _[Field](https://spec.graphql.org/October2021/#Field)_ name), and let
   {responseKeyB} be the response key of {fieldB}.
1. If {responseKeyA} is not equal to {responseKeyB}:
   - Return **false**.
1. Let {argumentsA} be the unordered set of
   _[Arguments](https://spec.graphql.org/October2021/#Arguments)_ passed to
   {fieldA}, and let {argumentsB} be the unordered set of
   _[Arguments](https://spec.graphql.org/October2021/#Arguments)_ passed to
   {fieldB}.
1. If {ArgumentsAreEquivalent(argumentsA, argumentsB)} is equal to **false**:
   - Return **false**.
1. Let {directivesA} be the ordered list of
   _[Directives](https://spec.graphql.org/October2021/#Directives)_ passed to
   {fieldA}, and let {directivesB} be the ordered list of
   _[Directives](https://spec.graphql.org/October2021/#Directives)_ passed to
   {fieldB}.
1. If {DirectivesAreEquivalent(directivesA, directivesB)} is equal to **false**:
   - Return **false**.
1. Return **true**.

InlineFragmentsAreEquivalent(inlineFragmentA, inlineFragmentB) :

1. Let {typeConditionA} be the
   _[TypeCondition](https://spec.graphql.org/October2021/#TypeCondition)_ of
   {inlineFragmentA}, and let {typeConditionB} be the
   _[TypeCondition](https://spec.graphql.org/October2021/#TypeCondition)_ of
   {inlineFragmentB}.
1. If {typeConditionA} does not exist:
   - If {typeConditionB} exists:
     - Return **false**.
1. If {typeConditionA} exists:
   - If {typeConditionB} does not exist:
     - Return **false**.
   - Let {typeA} be the name of the type from {typeConditionA}, and let {typeB}
     be the name of the type from {typeConditionB}.
   - If {typeA} is not equal to {typeB}:
     - Return **false**.
1. Let {directivesA} be the ordered list of
   _[Directives](https://spec.graphql.org/October2021/#Directives)_ passed to
   {inlineFragmentA}, and let {directivesB} be the ordered list of
   _[Directives](https://spec.graphql.org/October2021/#Directives)_ passed to
   {inlineFragmentB}.
1. If {DirectivesAreEquivalent(directivesA, directivesB)} is equal to **false**:
   - Return **false**.
1. Return **true**.

FragmentSpreadsAreEqual(fragmentSpreadA, fragmentSpreadB) :

1. Let {fragmentNameA} be the fragment name of {fragmentSpreadA}, and let
   {fragmentNameB} be the fragment name of {fragmentSpreadB}.
1. If {fragmentNameA} is not equal to {fragmentNameB}:
   - Return **false**.
1. Let {directivesA} be the ordered list of
   _[Directives](https://spec.graphql.org/October2021/#Directives)_ passed to
   {fragmentSpreadA}, and let {directivesB} be the ordered list of
   _[Directives](https://spec.graphql.org/October2021/#Directives)_ passed to
   {fragmentSpreadB}.
1. If {DirectivesAreEquivalent(directivesA, directivesB)} is equal to **false**:
   - Return **false**.
1. Return **true**.

DirectivesAreEquivalent(directivesA, directivesB) :

1. Let {lengthA} be the length of the ordered list {directivesA}, and let
   {lengthB} be the length of the ordered list {directivesB}.
1. If {lengthA} does not equal {lengthB}:
   - Return **false**.
1. For each {directiveA} in {directivesA}:
   - Let {directiveB} be the list item in {directivesB} with the same index as
     {directiveA} in {directivesA}.
   - Let {directiveNameA} be the name of {directiveA}, and let {directiveNameB}
     be the name of {directiveB}.
   - If {directiveNameA} is not equal to {directiveNameB}:
     - Return **false**.
   - Let {argumentsA} be the unordered set of
     _[Arguments](https://spec.graphql.org/October2021/#Arguments)_ passed to
     {directiveA}, and let {argumentsB} be the unordered set of
     _[Arguments](https://spec.graphql.org/October2021/#Arguments)_ passed to
     {directiveB}.
   - If {ArgumentsAreEquivalent(argumentsA, argumentsB)} is equal to **false**:
     - Return **false**.
1. Return **true**.

ArgumentsAreEquivalent(argumentsA, argumentsB) :

1. Let {sizeA} be the size of the unordered set {argumentsA}, and let {sizeB} be
   the size of the unordered set {argumentsB}.
1. If {sizeA} does not equal {sizeB}:
   - Return **false**.
1. For each {argumentA} in {argumentsA}:
   - Let {argumentB} be the set item from {argumentsB} where {argumentB} has the
     same name as {argumentA}.
   - If {argumentB} does not exist:
     - Return **false**.
   - Let {valueA} be the _[Value](https://spec.graphql.org/October2021/#Value)_
     of {argumentA}, and let {valueB} be the
     _[Value](https://spec.graphql.org/October2021/#Value)_ of {argumentB}.
   - If {ValuesAreEquivalent(valueA, valueB)} is equal to **false**:
     - Return **false**.
1. Return **true**.

ValuesAreEquivalent(valueA, valueB) :

1. If both {valueA} and {valueB} are a
   _[Variable](https://spec.graphql.org/October2021/#Variable)_ :
   - Return **true** if the name of {valueA} is equal to the name of {valueB},
     otherwise return **false**.
1. If both {valueA} and {valueB} are an
   _[IntValue](https://spec.graphql.org/October2021/#IntValue)_:
   - Return **true** if the integer represented by {valueA} is equal to the
     integer represented by {valueB}, otherwise return **false**.
1. If both {valueA} and {valueB} are a
   _[FloatValue](https://spec.graphql.org/October2021/#FloatValue)_:
   - Return **true** if the float value represented by {valueA} is equal to the
     float value represented by {valueB}, otherwise return **false**.
1. If both {valueA} and {valueB} are a
   _[StringValue](https://spec.graphql.org/October2021/#StringValue)_:
   - Return **true** if the string value represented by {valueA} is equal to the
     string value represented by {valueB}, otherwise return **false**.
1. If both {valueA} and {valueB} are a
   _[BooleanValue](https://spec.graphql.org/October2021/#BooleanValue)_:
   - Return **true** if the boolean value represented by {valueA} is equal to
     the boolean value represented by {valueB}, otherwise return **false**.
1. If both {valueA} and {valueB} are a
   _[NullValue](https://spec.graphql.org/October2021/#NullValue)_:
   - Return **true**.
1. If both {valueA} and {valueB} are a
   _[EnumValue](https://spec.graphql.org/October2021/#EnumValue)_:
   - Return **true** if the name of {valueA} is equal to the name of {valueB},
     otherwise return **false**.
1. If both {valueA} and {valueB} are a
   _[ListValue](https://spec.graphql.org/October2021/#ListValue)_:
   - Let {lengthA} be the length of {valueA}, and let {lengthB} be the length of
     {valueB}.
   - If {lengthA} is not equal to {lengthB}:
     - Return **false**.
   - For each {listItemA} in {valueA}:
     - Let {listItemB} be the list item in {valueB} with the same index as
       {listItemA} in {valueA}.
     - If {ValuesAreEquivalent(listItemA, listItemB)} is equal to **false**:
       - Return **false**.
   - Return **true**.
1. If both {valueA} and {valueB} are an
   _[ObjectValue](https://spec.graphql.org/October2021/#ObjectValue)_:
   - Let {sizeA} be the size of {valueA}, and let {sizeB} be the size of
     {valueB}.
   - If {sizeA} is not equal to {sizeB}:
     - Return **false**.
   - For each {objectFieldA} in {valueA}:
     - Let {objectFieldB} be the
       _[ObjectField](https://spec.graphql.org/October2021/#ObjectField)_ from
       {valueB} where {objectFieldB} has the same name as {objectFieldA}.
     - If {objectFieldB} does not exist:
       - Return **false**.
     - Let {objectValueA} be the
       _[Value](https://spec.graphql.org/October2021/#Value)_ of {objectFieldA},
       and let {objectValueB} be the
       _[Value](https://spec.graphql.org/October2021/#Value)_ of {objectFieldB}.
     - If {ValuesAreEquivalent(objectValueA, objectValueB)} is equal to
       **false**:
       - Return **false**.
   - Return **true**.
1. Return **false**.

**Example**

```graphql counter-example
{
  user(id: 4) {
    name
    friends {
      name
    }
    name
    friends {
      birthday
      name @uppercase
    }
    nameWithAlias: name
  }
}
```

```graphql example
{
  user(id: 4) {
    name
    friends {
      name
      birthday
      name @uppercase
    }
    nameWithAlias: name
  }
}
```

#### No Fragment Definitions

A normalized GraphQL document must not contain any
_[FragmentDefinition](https://spec.graphql.org/October2021/#FragmentDefinition)_.

Note: Given the requirement that the executable document does not produce any
validation errors, the absense of any _FragmentDefinition_ also implies the
absense of any
_[FragmentSpread](https://spec.graphql.org/October2021/#FragmentSpread)_.

**Example**

```graphql counter-example
{
  user(id: 4) {
    ...UserData
  }
}

fragment UserData on User {
  name
}
```

```graphql example
{
  user(id: 4) {
    name
  }
}
```

#### No Inline Fragments With Redundant Type Condition

A normalized GraphQL document must not contain any
_[InlineFragment](https://spec.graphql.org/October2021/#InlineFragment)_ that
does not have any
_[Directives](https://spec.graphql.org/October2021/#Directives)_ and that has a
_[TypeCondition](https://spec.graphql.org/October2021/#TypeCondition)_ defined
on the same type as the surrounding selection set.

**Example**

This example assumes that that the return type of the `user` field is `User`.

```graphql counter-example
{
  user(id: 4) {
    ... on User {
      name
    }
  }
}
```

```graphql example
{
  user(id: 4) {
    name
  }
}
```

#### No Inline Fragments Without Context

A normalized GraphQL document must not contain any
_[InlineFragment](https://spec.graphql.org/October2021/#InlineFragment)_ that
does not have a
_[TypeCondition](https://spec.graphql.org/October2021/#TypeCondition)_ and that
does not have any
_[Directives](https://spec.graphql.org/October2021/#Directives)_.

**Example**

```graphql counter-example
{
  user(id: 4) {
    ... {
      name
    }
  }
}
```

```graphql example
{
  user(id: 4) {
    name
  }
}
```

#### No Leading Redundant Interface Selections

A normalized GraphQL document must not contain any leading redundant
_[Selection](https://spec.graphql.org/October2021/#Selection)_ inside an
_[InlineFragment](https://spec.graphql.org/October2021/#InlineFragment)_ defined
inside a selection set of a parent field that returns an
_[interface type](https://spec.graphql.org/October2021/#sec-Interfaces)_, where
an equal selection is already defined in said selection set _somewhere before_
the _[InlineFragment](https://spec.graphql.org/October2021/#InlineFragment)_.

Formally, a selection is considered _leading redundant_ if
{SelectionIsLeadingRedundant} returns **true**.

SelectionIsLeadingRedundant(selection) :

1. Let {selectionSet} be the selection set in which {selection} is defined.
1. Let {parentNode} be the node that contains {selectionSet}.
1. If {parentNode} is not an
   _[InlineFragments](https://spec.graphql.org/October2021/#InlineFragment)_:
   - Return **false**.
1. Let {parentSelectionSet} be the selection set that contains {parentNode}.
1. Let {parentType} be the result of {TypeForSelectionSet(parentSelectionSet)}.
1. If {parentType} is not an
   _[interface type](https://spec.graphql.org/October2021/#sec-Interfaces)_:
   - Return **false**.
1. Let {previousSelections} be the list of selection in {parentSelectionSet}
   before {parentNode}.
1. If {previousSelections} is empty:
   - Return **false**.
1. For each {previousSelection} in {previousSelections}:
   - If {SelectionsAreEqual(selection, previousSelection)} is equal to **true**:
     - Return **true**.
1. Return **false**.

TypeForSelectionSet(selectionSet) :

1. Let {parentNode} be the node that contains {selectionSet}.
1. If {parentNode} is an
   _[OperationDefinition](https://spec.graphql.org/October2021/#OperationDefinition)_:
   - Let {operationType} be the operation type of {parentNode}.
   - Let {rootOperationType} be the named type defined in the
     _[RootOperationTypeDefinition](https://spec.graphql.org/October2021/#RootOperationTypeDefinition)_
     for {operationType}.
   - Return {rootOperationType}.
1. If {parentNode} is a _[Field](https://spec.graphql.org/October2021/#Field)_:
   - Let {fieldDefinition} be the
     _[FieldDefinition](https://spec.graphql.org/October2021/#FieldDefinition)_
     that defines the field {parentNode}.
   - Let {outputType} be the type of {fieldDefinition}.
   - Let {unwrappedType} be the
     _[unwrapped type](https://spec.graphql.org/October2021/#sec-Wrapping-Types)_
     of {outputType}.
   - Return {unwrappedType}.
1. If {parentNode} is an
   _[InlineFragment](https://spec.graphql.org/October2021/#InlineFragment)_:
   - Let {typeCondition} be the
     _[TypeCondition](https://spec.graphql.org/October2021/#TypeCondition)_ of
     {parentNode}.
   - If {typeCondition} exists:
     - Let {type} be the type of {typeCondition}.
     - Return {type}.
   - If {typeCondition} does not exist:
     - Let {parentSelectionSet} be the selection set that contains {parentNode}.
     - Return {TypeForSelectionSet(parentSelectionSet)}.
1. If {parentNode} is a
   _[FragmentSpread](https://spec.graphql.org/October2021/#FragmentSpread)_:
   - Let {typeCondition} be the
     _[TypeCondition](https://spec.graphql.org/October2021/#TypeCondition)_ of
     {parentNode}.
   - Let {type} be the type of {typeCondition}.
   - Return {type}.

SelectionsAreEqual(selectionA, selectionB) :

1. If both {selectionA} and {selectionB} are
   _[Fields](https://spec.graphql.org/October2021/#Field)_:
   - Return {FieldsAreEqual(selectionA, selectionB)}
1. If both {selectionA} and {selectionB} are
   _[InlineFragments](https://spec.graphql.org/October2021/#InlineFragment)_:
   - Return {InlineFragmentsAreEqual(selectionA, selectionB)}
1. If both {selectionA} and {selectionB} are
   _[FragmentSpreads](https://spec.graphql.org/October2021/#FragmentSpread)_:
   - Return {FragmentSpreadsAreEqual(selectionA, selectionB)}
1. Return **false**.

FieldsAreEqual(fieldA, fieldB) :

1. If {FieldsAreEquivalent(fieldA, fieldB)} is equal to **false**:
   - Return **false**.
1. Let {selectionSetA} be the selection set of {fieldA}, and let {selectionSetB}
   be the selection set of {fieldB}.
1. If {selectionSetA} does not exist:
   - Return **true** if {selectionSetB} does not exist, otherwise return
     **false**.
1. If {selectionSetB} does not exist:
   - Return **false**.
1. Return {SelectionSetsAreEqual(selectionSetA, selectionSetB)}.

InlineFragmentsAreEqual(inlineFragmentA, inlineFragmentB) :

1. If {InlineFragmentsAreEquivalent(inlineFragmentA, inlineFragmentB)} is equal
   to **false**:
   - Return **false**.
1. Let {selectionSetA} be the selection set of {inlineFragmentA}, and let
   {selectionSetB} be the selection set of {inlineFragmentB}.
1. Return {SelectionSetsAreEqual(selectionSetA, selectionSetB)}.

SelectionSetsAreEqual(selectionSetA, selectionSetB) :

1. If the count of selections in {selectionSetA} is not equal to the count of
   selections in {selectionSetB}:
   - Return **false**.
1. For each _[Selection](https://spec.graphql.org/October2021/#Selection)_
   {selectionA} in {selectionSetA}:
   - Let {selectionB} be the
     _[Selection](https://spec.graphql.org/October2021/#Selection)_ from
     {selectionSetB} at the same index as {selectionA} in {selectionSetA}.
   - If {SelectionsAreEqual(selectionA, selectionB)} is equal to **false**:
     - Return **false**.
1. Return **true**.

**Example**

```graphql counter-example
{
  profile(id: 4) {
    handle
    ... on User {
      handle
      name
    }
  }
}
```

```graphql example
{
  profile(id: 4) {
    handle
    ... on User {
      name
    }
  }
}
```

#### No Lagging Redundant Interface Selections

A normalized GraphQL document must not contain any lagging redundant
_[Selection](https://spec.graphql.org/October2021/#Selection)_ that is the first
selection inside an
_[InlineFragment](https://spec.graphql.org/October2021/#InlineFragment)_ defined
inside a selection set of a parent field that returns an
_[interface type](https://spec.graphql.org/October2021/#sec-Interfaces)_, where
an equal selection is already defined in said selection set _immediately after_
the _[InlineFragment](https://spec.graphql.org/October2021/#InlineFragment)_.

A lagging redundant selection should be replaced by only specifying the
selection once _immediately before_ said
_[InlineFragment](https://spec.graphql.org/October2021/#InlineFragment)_.

Formally, a selection is considered _lagging redundant_ if
{SelectionIsLaggingRedundant} returns **true**.

SelectionIsLaggingRedundant(selection) :

1. Let {selectionSet} be the selection set in which {selection} is defined.
1. If {selection} is not the first
   _[Selection](https://spec.graphql.org/October2021/#Selection)_ in
   {selectionSet}:
   - Return **false**.
1. Let {parentNode} be the node that contains {selectionSet}.
1. If {parentNode} is not an
   _[InlineFragments](https://spec.graphql.org/October2021/#InlineFragment)_:
   - Return **false**.
1. Let {parentSelectionSet} be the selection set that contains {parentNode}.
1. Let {parentType} be the result of {TypeForSelectionSet(parentSelectionSet)}.
1. If {parentType} is not an
   _[interface type](https://spec.graphql.org/October2021/#sec-Interfaces)_:
   - Return **false**.
1. Let {nextSelection} be the selection in {parentSelectionSet} after
   {parentNode}.
1. If {nextSelection} does not exist:
   - Return **false**.
1. Return {SelectionsAreEqual(selection, nextSelection)}.

**Example**

```graphql counter-example
{
  profile(id: 4) {
    ... on User {
      handle
      friends {
        name
      }
    }
    handle
  }
}
```

```graphql example
{
  profile(id: 4) {
    handle
    ... on User {
      friends {
        name
      }
    }
  }
}
```

#### No Lagging Redundant Interface Selection List

A normalized GraphQL document must not contain any lagging redundant
_[Selection](https://spec.graphql.org/October2021/#Selection)_ list that is
located at the end of a selection set inside an
_[InlineFragment](https://spec.graphql.org/October2021/#InlineFragment)_ defined
inside a selection set of a parent field that returns an
_[interface type](https://spec.graphql.org/October2021/#sec-Interfaces)_, where
an equal list of selections is already defined in said selection set
_immediately after_ the
_[InlineFragment](https://spec.graphql.org/October2021/#InlineFragment)_.

Formally, a list of consecutive selections is considered _lagging redundant_ if
{SelectionListIsLaggingRedundant} returns **true**.

SelectionListIsLaggingRedundant(selections) :

1. Let {selectionSet} be the selection set in which the
   _[Selections](https://spec.graphql.org/October2021/#Selection)_ from
   {selections} are defined.
1. If there exists one ore more
   _[Selections](https://spec.graphql.org/October2021/#Selection)_ in
   {selectionSet} after {selections}:
   - Return **false**.
1. Let {parentNode} be the node that contains {selectionSet}.
1. If {parentNode} is not an
   _[InlineFragments](https://spec.graphql.org/October2021/#InlineFragment)_:
   - Return **false**.
1. Let {parentSelectionSet} be the selection set that contains {parentNode}.
1. Let {parentType} be the result of {TypeForSelectionSet(parentSelectionSet)}.
1. If {parentType} is not an
   _[interface type](https://spec.graphql.org/October2021/#sec-Interfaces)_:
   - Return **false**.
1. Let {nextSelections} be the list of selections in {parentSelectionSet} after
   {parentNode} with the same length as {selections}.
1. If the length of {nextSelections} is smaller than the length of {selections}:
   - Return **false**.
1. For each {selection} in {selections}:
   - Let {nextSelection} be the selection from {nextSelections} with the same
     index as {selection} in {selections}.
   - If {SelectionsAreEqual(selection, nextSelection)} is equal to **false**:
     - Return **false**.
1. Return **true**.

**Example**

```graphql counter-example
{
  profile(id: 4) {
    ... on User {
      friends {
        name
      }
      __typename
      handle
    }
    __typename
    handle
  }
}
```

```graphql example
{
  profile(id: 4) {
    ... on User {
      friends {
        name
      }
    }
    __typename
    handle
  }
}
```

#### No Repeated Interface Selections in Exhaustive Fragment List

A normalized GraphQL document must not contain any lists of adjacent and
exhaustive
_[InlineFragments](https://spec.graphql.org/October2021/#InlineFragment)_ inside
of a selection set of a field that returns an
_[interface type](https://spec.graphql.org/October2021/#sec-Interfaces)_ where
all of the following conditions hold:

- Either all the first
  _[Selections](https://spec.graphql.org/October2021/#Selection)_ or all the
  last _[Selections](https://spec.graphql.org/October2021/#Selection)_ inside
  each of the
  _[InlineFragments](https://spec.graphql.org/October2021/#InlineFragment)_ are
  equal (i.e. {SelectionsAreEqual} returns **true**).
- The _[Selection](https://spec.graphql.org/October2021/#Selection)_ identified
  by the previous condition is defined on the given
  _[interface type](https://spec.graphql.org/October2021/#sec-Interfaces)_
  - If the _[Selection](https://spec.graphql.org/October2021/#Selection)_ is a
    _[Field](https://spec.graphql.org/October2021/#Field)_, that means the field
    is defined in the
    _[interface type](https://spec.graphql.org/October2021/#sec-Interfaces)_.
  - If the _[Selection](https://spec.graphql.org/October2021/#Selection)_ is an
    _[InlineFragment](https://spec.graphql.org/October2021/#InlineFragment)_,
    that means the
    _[InlineFragment](https://spec.graphql.org/October2021/#InlineFragment)_
    either has no type condition or the type from its type condition is equal to
    the given
    _[interface type](https://spec.graphql.org/October2021/#sec-Interfaces)_.
    _[interface type](https://spec.graphql.org/October2021/#sec-Interfaces)_.
- All _[InlineFragments](https://spec.graphql.org/October2021/#InlineFragment)_
  do not have any
  _[custom directive](http://spec.graphql.org/October2021/#sec-Type-System.Directives.Custom-Directives)_
  applied to them.

Instead, such a _[Selection](https://spec.graphql.org/October2021/#Selection)_
identified by the above conditions should only be specified once, namely before
(in case it's the first field in all
_[InlineFragments](https://spec.graphql.org/October2021/#InlineFragment)_) or
after (in case it's the last field in all
_[InlineFragments](https://spec.graphql.org/October2021/#InlineFragment)_) the
list of adjacent and exhaustive
_[InlineFragments](https://spec.graphql.org/October2021/#InlineFragment)_.

Given a selection set for a field that returns an
_[interface type](https://spec.graphql.org/October2021/#sec-Interfaces)_
{interface} and a list of adjacent
_[InlineFragments](https://spec.graphql.org/October2021/#InlineFragment)_
{fragments} inside this selection set, the list {fragments} is considered
_exhaustive_ if {FragmentsAreExhaustive(fragments, interface)} returns **true**.

FragmentsAreExhaustive(fragments, interface) :

1. Let {fragmentTypes} be an empty set.
1. For each {fragment} in {fragments}:
   - Let {typeCondition} be the type condition of {fragment}.
   - If {typeCondition} does not exist:
     - Continue to the next fragment.
   - Let {type} be the name of the type from {typeCondition}.
   - If {type} is an
     _[object type](https://spec.graphql.org/October2021/#sec-Objects)_:
     - Add {type} to {fragmentTypes}.
   - If {type} is an
     _[interface type](https://spec.graphql.org/October2021/#sec-Interfaces)_:
     - Let {implementors} be the result of {Implementors(type)}.
     - Add all set items of {implementors} to {fragmentTypes}.
1. Let {interfaceImplementors} be the result of {Implementors(interfaceType)}.
1. For each {implementor} in {interfaceImplementors}:
   - If {fragmentTypes} does not contain {implementor}:
     - Return **false**.
1. Return **true**.

Implementors(interfaceType) :

1. Let {objectImplementors} be the set of
   _[object types](https://spec.graphql.org/October2021/#sec-Objects)_ that
   implement the interface type {interfaceType}.
1. Let {interfaceImplementors} be the set of
   _[interface types](https://spec.graphql.org/October2021/#sec-Interfaces)_
   that implement the interface type {interfaceType}.
1. For each {interface} in {interfaceImplementors}:
   - Let {objects} be the result of calling {Implementors(interface)}.
   - Add all entries of the set {objects} to the set {objectImplementors}.
1. Return {objectImplementors}.

**Example**

For this example, assume that the field `profile` returns an interface type
`Profile`, and that there exist exactly two object types `User` and
`Organization` that implement this interface type. Furthermore, assume that the
`Profile` interface defines a field named `handle`.

```graphql counter-example
{
  profile(id: 4) {
    ... on Organization {
      handle
      members {
        name
      }
    }
    ... on User {
      handle
      name
    }
  }
}
```

```graphql example
{
  profile(id: 4) {
    handle
    ... on Organization {
      members {
        name
      }
    }
    ... on User {
      name
    }
  }
}
```

Note: Assume there would exist a third object type `Influencer` that also
implements the interface `Profile`. Then the counter example above would
actually be normalized because the list of inline fragments would not be
exhaustive, and there does not exist a selection for the field `handle` for the
type `Influencer`.

#### No Constant @skip Directive

A normalized GraphQL document must not contain any
_[@skip](https://spec.graphql.org/October2021/#sec--skip)_ directive where the
_[Value](https://spec.graphql.org/October2021/#Value)_ passed to the _if_
argument is a
_[BooleanValue](https://spec.graphql.org/October2021/#BooleanValue)_.

**Example**

```graphql counter-example
{
  user(id: 4) {
    name
    ... @skip(if: true) {
      birthday
    }
    ... @skip(if: false) {
      friends {
        name
      }
    }
  }
}
```

```graphql example
{
  user(id: 4) {
    name
    friends {
      name
    }
  }
}
```

#### No Constant @include Directive

A normalized GraphQL document must not contain any
_[@include](https://spec.graphql.org/October2021/#sec--include)_ directive where
the _[Value](https://spec.graphql.org/October2021/#Value)_ passed to the _if_
argument is a
_[BooleanValue](https://spec.graphql.org/October2021/#BooleanValue)_.

**Example**

```graphql counter-example
{
  user(id: 4) {
    name
    ... @include(if: true) {
      birthday
    }
    ... @include(if: false) {
      friends {
        name
      }
    }
  }
}
```

```graphql example
{
  user(id: 4) {
    name
    birthday
  }
}
```

### Ordering

In the GraphQL query language there exist unordered sets of items where the
order in textual representation does not affect the semantics of the set. All
such sets must be ordered alphabetically by some identifier according to the
rules in this section.

#### Ordered Definitions

In order to be normalized, all
_[OperationDefinitions](https://spec.graphql.org/October2021/#OperationDefinition)_
in a GraphQL document must be ordered alphabetically by their name. An
_[OperationDefinition](https://spec.graphql.org/October2021/#OperationDefinition)_
without a name must be the first definition in the GraphQL document. All
_[Definitions](https://spec.graphql.org/October2021/#Definition)_ that are not
an
_[OperationDefinition](https://spec.graphql.org/October2021/#OperationDefinition)_
must be ordered after all
_[OperationDefinitions](https://spec.graphql.org/October2021/#OperationDefinition)_.

**Example**

```graphql counter-example
query User {
  user(id: 4) {
    name
  }
}

query Profile {
  profile(userId: 4) {
    handle
  }
}

{
  user(id: 5) {
    birthday
  }
}
```

```graphql example
{
  user(id: 5) {
    birthday
  }
}

query Profile {
  profile(userId: 4) {
    handle
  }
}

query User {
  user(id: 4) {
    name
  }
}
```

#### Ordered Variable Definitions

In order to be normalized, all
_[VariableDefinitions](https://spec.graphql.org/October2021/#VariableDefinitions)_
in a GraphQL document must be ordered alphabetically by
_[Variable](https://spec.graphql.org/October2021/#Variable)_ name.

**Example**

```graphql counter-example
query ($id: Int, $friendName: String) {
  user(id: $id) {
    friend(name: $friendName) {
      birthday
    }
  }
}
```

```graphql example
query ($friendName: String, $id: Int) {
  user(id: $id) {
    friend(name: $friendName) {
      birthday
    }
  }
}
```

#### Ordered Arguments

In order to be normalized, all
_[Arguments](https://spec.graphql.org/October2021/#Arguments)_ in a GraphQL
document must be ordered alphabetically by
_[Argument](https://spec.graphql.org/October2021/#Argument)_ name.

**Example**

```graphql counter-example
{
  user(name: "Bill", birthday: "1955-10-28") {
    name
  }
}
```

```graphql example
{
  user(birthday: "1955-10-28", name: "Bill") {
    name
  }
}
```

#### Ordered Input Object Values

In order to be normalized, all
_[ObjectValue](https://spec.graphql.org/October2021/#ObjectValue)_ in a GraphQL
document must be ordered alphabetically by
_[ObjectField](https://spec.graphql.org/October2021/#ObjectField)_ name.

**Example**

```graphql counter-example
{
  user(input: { name: "Bill", birthday: "1955-10-28" }) {
    name
  }
}
```

```graphql example
{
  user(input: { birthday: "1955-10-28", name: "Bill" }) {
    name
  }
}
```

#### Ordered Non-Overlapping Inline Fragments

In order to be normalized, any two adjacent
_[InlineFragments](https://spec.graphql.org/October2021/#InlineFragments)_ in a
GraphQL document that are non-overlapping and that don't have any
_[custom directive](http://spec.graphql.org/October2021/#sec-Type-System.Directives.Custom-Directives)_
applied must be ordered alphabetically by the type name of their
_[TypeCondition](https://spec.graphql.org/October2021/#TypeCondition)_. Two
_[InlineFragments](https://spec.graphql.org/October2021/#InlineFragments)_ are
considered non-overlapping if {InlineFragmentsOverlap} returns **false**.

Note: This specification assumes that any
_[custom directive](http://spec.graphql.org/October2021/#sec-Type-System.Directives.Custom-Directives)_
may influence the execution of the given document. Hence, this rule is
formulated defensively and explicitly excludes inline fragments annotated with a
custom directive.

InlineFragmentsOverlap(inlineFragmentA, inlineFragmentB) :

1. Let {typeConditionA} be the type condition of {inlineFragmentA}, and let
   {typeConditionB} be the type condition of {inlineFragmentB}.
1. If {typeConditionA} does not exist:
   - Return **true**.
1. If {typeConditionB} does not exist:
   - Return **true**.
1. Let {typeNameA} be the name of the type from {typeConditionA}, and let
   {typeNameB} be the name of the type from {typeConditionB}.
1. Let {typeA} be the schema type with the name {typeNameA}, and let {typeB} be
   the schema type with the name {typeNameB}.
1. Return {TypesOverlap(typeA, typeB)}.

TypesOverlap(typeA, typeB) :

1. If both {typeA} and {typeB} are
   _[object types](https://spec.graphql.org/October2021/#sec-Objects)_:
   - Return **true** if {typeA} is equal to {typeB}, otherwise return **false**.
1. If both {typeA} and {typeB} are
   _[interface types](https://spec.graphql.org/October2021/#sec-Interfaces)_:
   - Let {implementorsA} be the result of {Implementors(typeA)}, and let
     {implementorsB} be the result of {Implementors(typeB)}.
   - Return **true** if the intersection of the sets {implementorsA} and
     {implementorsB} is not an empty set, otherwise return **false**.
1. If both {typeA} and {typeB} are
   _[union types](https://spec.graphql.org/October2021/#sec-Unions)_:
   - Let {memberTypesA} be the set of union member types of {typeA}, and let
     {memberTypesB} be the set of union member types of {typeB}.
   - Return **true** if the intersection of the sets {memberTypesA} and
     {memberTypesB} is not an empty set, otherwise return **false**.
1. If one of {typeA} and {typeB} is an
   _[object type](https://spec.graphql.org/October2021/#sec-Objects)_, and one
   of {typeA} and {typeB} is an
   _[interface type](https://spec.graphql.org/October2021/#sec-Interfaces)_:
   - Let {objectType} be the one type of {typeA} and {typeB} that is an
     _[object type](https://spec.graphql.org/October2021/#sec-Objects)_.
   - Let {interfaceType} be the one type of {typeA} and {typeB} that is an
     _[interface type](https://spec.graphql.org/October2021/#sec-Interfaces)_.
   - Let {implementors} be the result of calling {Implementors(interfaceType)}.
   - Return **true** if {implementors} contains {objectType}, otherwise return
     **false**.
1. If one of {typeA} and {typeB} is an
   _[object type](https://spec.graphql.org/October2021/#sec-Objects)_, and one
   of {typeA} and {typeB} is a
   _[union type](https://spec.graphql.org/October2021/#sec-Unions)_:
   - Let {objectType} be the one type of {typeA} and {typeB} that is an
     _[object type](https://spec.graphql.org/October2021/#sec-Objects)_.
   - Let {unionType} be the one type of {typeA} and {typeB} that is an
     _[union type](https://spec.graphql.org/October2021/#sec-Unions)_.
   - Let {memberTypes} be the set of union member types of {unionType}.
   - Return **true** if {memberTypes} contains {objectType}, otherwise return
     **false**.
1. If one of {typeA} and {typeB} is an
   _[interface type](https://spec.graphql.org/October2021/#sec-Interfaces)_, and
   one of {typeA} and {typeB} is a
   _[union type](https://spec.graphql.org/October2021/#sec-Unions)_:
   - Let {interfaceType} be the one type of {typeA} and {typeB} that is an
     _[interface type](https://spec.graphql.org/October2021/#sec-Interfaces)_.
   - Let {unionType} be the one type of {typeA} and {typeB} that is an
     _[union type](https://spec.graphql.org/October2021/#sec-Unions)_.
   - Let {implementors} be the result of {Implementors(interfaceType)}.
   - Let {memberTypes} be the set of union member types of {unionType}.
   - Return **true** if the intersection of the sets {implementors} and
     {memberTypes} is not an empty set, otherwise return **false**.
1. Return **false**.

**Example for Interface Types**

For this example, assume that the field `profile` returns an interface type
`Profile`, and that there exist two object types `User` and `Organization` that
implement this interface type.

```graphql counter-example
{
  profile(id: 4) {
    handle
    ... on User {
      name
    }
    ... on Organization {
      members {
        name
      }
    }
  }
}
```

```graphql example
{
  profile(id: 4) {
    handle
    ... on Organization {
      members {
        name
      }
    }
    ... on User {
      name
    }
  }
}
```

**Example for Union Types**

For this example, assume that the field `userResult` returns a union type with
two member types `User` and `Error`.

```graphql counter-example
{
  userResult(id: 4) {
    ... on User {
      name
    }
    ... on Error {
      message
    }
  }
}
```

```graphql example
{
  userResult(id: 4) {
    ... on Error {
      message
    }
    ... on User {
      name
    }
  }
}
```

Note: Since only
_[object types](https://spec.graphql.org/October2021/#sec-Objects)_ are valid
union member types, two fragments with different type conditions inside a
selection set for a
_[union type](https://spec.graphql.org/October2021/#sec-Unions)_ can never
overlap.

**Example for Nested Interface Types**

For this example, assume the following GraphQL schema.

```graphql
type Query {
  node(id: ID): Node
}

interface Node {
  id: ID
}

interface InterfaceA implements Node {
  id: ID
  fieldA: String
}

interface InterfaceB implements Node {
  id: ID
  fieldB: String
}

type ObjectA implements Node & InterfaceA {
  id: ID
  fieldA: String
}

type ObjectB implements Node & InterfaceB {
  id: ID
  fieldB: String
}

type ObjectAB implements Node & InterfaceA & InterfaceB {
  id: ID
  fieldA: String
  fieldB: String
}
```

Then the following query is normalized.

```graphql example
{
  node(id: 4) {
    ... on InterfaceB {
      fieldB
    }
    ... on InterfaceA {
      fieldA
    }
  }
}
```

The two inline fragments cannot be reordered without potentially changing the
order of fields in the execution result. If the returned node if of type
`ObjectAB` then both type conditions of the two inline fragments will match, and
the fields are returned in the order in which the inline fragments are included
in the selection set.

Note: If the object type `ObjectAB` would not exist, then the example query
above would **not** be normalized, because `InterfaceA` and `InterfaceB` would
not overlap anymore. In other words, for all possible object types returned by
the `node` field only one of the inline fragments could be applied, but never
both.

## Type System Documents

TODO: basically also just sort things
