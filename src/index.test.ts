import { buildSchema, print } from "graphql";
import { describe, expect, test } from "vitest";
import { normalize, normalizedPrint } from ".";

const schema = buildSchema(/* GraphQL */ `
  type Query {
    profile(id: ID!): Profile
    user(id: ID!): User
    userResult(id: ID!): UserResult!

    kitchenSink(
      ints: [Int]
      floats: [Float]
      booleans: [Boolean]
      strings: [String]
    ): KitchenSink
    greet(name: String): String
  }

  union UserResult = User | Error

  interface Profile {
    handle: String
    followers: Followers
  }

  type Followers {
    count: Int
  }

  type User implements Profile {
    handle: String
    followers: Followers

    name: String
    birthday(includeYear: Boolean, humanReadable: Boolean): String
    friends: [User]
  }

  type Organization implements Profile {
    handle: String
    followers: Followers

    members: [User]
  }

  type Error {
    message: String
  }

  type KitchenSink {
    hello: String
    world: String
  }

  directive @custom on INLINE_FRAGMENT
`);

describe("Normalized Printing", () => {
  test("separates non-puncuator tokens with a space", () => {
    const source = /* GraphQL */ `
      {
        kitchenSink(
          ints: [1, -2, 3]
          floats: [1.23, -4.56, 7.89]
          booleans: [true, false]
          strings: ["hello", "world"]
        ) {
          hello
          world
        }
      }
    `;
    expect(normalizedPrint(normalize(source, schema))).toMatchInlineSnapshot(
      '"{kitchenSink(ints:[1 -2 3]floats:[1.23 -4.56 7.89]booleans:[true false]strings:[\\"hello\\" \\"world\\"]){hello world}}"',
    );
  });

  test("separates spread token after a non-punctuator token with a space", () => {
    const source = /* GraphQL */ `
      {
        greet
        ... @custom {
          kitchenSink {
            hello
          }
        }
      }
    `;
    expect(normalizedPrint(normalize(source, schema))).toMatchInlineSnapshot(
      '"{greet ...@custom{kitchenSink{hello}}}"',
    );
  });

  test("does not separate spread token after a punctuator token", () => {
    const source = /* GraphQL */ `
      {
        ... @custom {
          kitchenSink {
            hello
          }
        }
      }
    `;
    expect(normalizedPrint(normalize(source, schema))).toMatchInlineSnapshot(
      '"{...@custom{kitchenSink{hello}}}"',
    );
  });

  test("prints all strings as regular strings", () => {
    const source = /* GraphQL */ `
      {
        kitchenSink(
          strings: [
            "hello"
            """
            world
            and me
            """
          ]
        )
      }
    `;
    expect(normalizedPrint(normalize(source, schema))).toMatchInlineSnapshot(
      '"{kitchenSink(strings:[\\"hello\\" \\"world\\\\nand me\\"])}"',
    );
  });

  test("prints excaped unicode characters", () => {
    // prettier-ignore
    const source = /* GraphQL */ `
      {
        kitchenSink(strings: ["\uD83D\uDCA9\u2764\u{1F4A9}"])
      }
    `;
    expect(normalizedPrint(normalize(source, schema))).toMatchInlineSnapshot(
      '"{kitchenSink(strings:[\\"💩❤💩\\"])}"',
    );
  });
});

test("No Redundant Field Alias", () => {
  const source = /* GraphQL */ `
    {
      user(id: 4) {
        name: name
      }
    }
  `;
  expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
    "{
      user(id: 4) {
        name
      }
    }"
  `);
});

describe("No Duplicate Selection", () => {
  test("removes duplicate fields", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          name
          birthday
          name
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          name
          birthday
        }
      }"
    `);
  });

  test("removes duplicate inline fragments", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          ... on User {
            name
          }
          ... on User {
            name
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          ... on User {
            name
          }
        }
      }"
    `);
  });

  test("removes duplicate alias", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          username: name
          birthday
          username: name
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          username: name
          birthday
        }
      }"
    `);
  });

  test("keeps distinct alias", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          name
          birthday
          username: name
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          name
          birthday
          username: name
        }
      }"
    `);
  });

  test("removes duplicate arguments", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          birthday(includeYear: false, humanReadable: true)
          name
          birthday(humanReadable: true, includeYear: false)
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          birthday(includeYear: false, humanReadable: true)
          name
        }
      }"
    `);
  });

  test("keeps distinct arguments", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          birthday(includeYear: false)
          name
          birthday(includeYear: false, humanReadable: true)
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          birthday(includeYear: false)
          name
          birthday(includeYear: false, humanReadable: true)
        }
      }"
    `);
  });

  test("keeps distinct arguments", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          birthday(includeYear: false, humanReadable: true)
          name
          birthday(includeYear: false)
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          birthday(includeYear: false, humanReadable: true)
          name
          birthday(includeYear: false)
        }
      }"
    `);
  });

  test("removes duplicate directives", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          name @hey @ho
          birthday
          name @hey @ho
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          name @hey @ho
          birthday
        }
      }"
    `);
  });

  test("keeps distinct directives", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          name @hey @ho
          birthday
          name @hey
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          name @hey @ho
          birthday
          name @hey
        }
      }"
    `);
  });

  test("keeps distinct directives", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          name @hey
          birthday
          name @hey @ho
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          name @hey
          birthday
          name @hey @ho
        }
      }"
    `);
  });

  test("keeps distinct directives", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          name @ho @hey
          birthday
          name @hey @ho
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          name @ho @hey
          birthday
          name @hey @ho
        }
      }"
    `);
  });

  test("merges selection sets", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          name
        }
        user(id: 4) {
          name
          birthday
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          name
          birthday
        }
      }"
    `);
  });

  test("merges nested selection sets", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          ... on User {
            name
          }
          ... on User {
            name
            birthday
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          ... on User {
            name
            birthday
          }
        }
      }"
    `);
  });

  test("merges deeply nested selection sets", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          ... on User {
            name
          }
        }
        profile(id: 4) {
          ... on User {
            name
            birthday
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          ... on User {
            name
            birthday
          }
        }
      }"
    `);
  });
});

describe("No Fragment Definitions", () => {
  test("top-level fragment", () => {
    const source = /* GraphQL */ `
      {
        ...UserData
      }

      fragment UserData on Query {
        user(id: 4) {
          name
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          name
        }
      }"
    `);
  });

  test("field fragment", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          ...UserData
        }
      }

      fragment UserData on User {
        name
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          name
        }
      }"
    `);
  });

  test("nested fragments", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          ...UserData
        }
      }

      fragment UserData on User {
        name
        friends {
          ...FriendData
        }
      }

      fragment FriendData on User {
        name
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          name
          friends {
            name
          }
        }
      }"
    `);
  });
});

describe("No Inline Fragments With Redundant Type Condition", () => {
  test("removes redundant type conditions", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          ... on User {
            name
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          name
        }
      }"
    `);
  });

  test("removes redundant type conditions for nested fragments", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          ... on User {
            ... on User {
              ... on User {
                name
              }
            }
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          name
        }
      }"
    `);
  });

  test("does not remove redundant type conditions for interfaces", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          handle
          ... on User {
            name
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          handle
          ... on User {
            name
          }
        }
      }"
    `);
  });

  test("does not remove redundant type conditions for unions", () => {
    const source = /* GraphQL */ `
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
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        userResult(id: 4) {
          ... on User {
            name
          }
          ... on Error {
            message
          }
        }
      }"
    `);
  });
});

describe("No Inline Fragments Without Context", () => {
  test("single field", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          ... {
            name
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          name
        }
      }"
    `);
  });

  test("multiple fields", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          ... {
            name
          }
          birthday
          ... {
            name
            friends {
              name
            }
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          name
          birthday
          friends {
            name
          }
        }
      }"
    `);
  });

  test("nested fragments", () => {
    const source = /* GraphQL */ `
      {
        user(id: 4) {
          ... {
            ... {
              ... {
                name
              }
            }
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          name
        }
      }"
    `);
  });
});

describe("No Leading Redundant Interface Selections", () => {
  test("removes one leading redundant field", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          handle
          ... on User {
            handle
            name
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          handle
          ... on User {
            name
          }
        }
      }"
    `);
  });

  test("removes multiple leading redundant fields", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          __typename
          handle
          ... on User {
            __typename
            handle
            name
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          __typename
          handle
          ... on User {
            name
          }
        }
      }"
    `);
  });

  test("removes leading redundant field in fragment spreads", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          handle
          ...UserFragment
        }
      }

      fragment UserFragment on User {
        handle
        name
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          handle
          ... on User {
            name
          }
        }
      }"
    `);
  });

  test("removes leading redundant field with selection set", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          followers {
            count
          }
          ... on User {
            followers {
              count
            }
            name
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          followers {
            count
          }
          ... on User {
            name
          }
        }
      }"
    `);
  });

  test("removes leading redundant inline fragment", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          ... @custom {
            handle
          }
          ... on User {
            ... @custom {
              handle
            }
            name
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          ... @custom {
            handle
          }
          ... on User {
            name
          }
        }
      }"
    `);
  });
});

describe("No Lagging Redundant Interface Selections", () => {
  test("removes one lagging redundant field", () => {
    const source = /* GraphQL */ `
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
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          handle
          ... on User {
            friends {
              name
            }
          }
        }
      }"
    `);
  });

  test("removes multiple lagging redundant fields", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          ... on User {
            __typename
            handle
            friends {
              name
            }
          }
          __typename
          handle
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          __typename
          handle
          ... on User {
            friends {
              name
            }
          }
        }
      }"
    `);
  });

  test("removes lagging redundant field in fragment spreads", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          ...UserFragment
          handle
        }
      }

      fragment UserFragment on User {
        handle
        friends {
          name
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          handle
          ... on User {
            friends {
              name
            }
          }
        }
      }"
    `);
  });

  test("removes lagging redundant field with selection set", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          ... on User {
            followers {
              count
            }
            friends {
              name
            }
          }
          followers {
            count
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          followers {
            count
          }
          ... on User {
            friends {
              name
            }
          }
        }
      }"
    `);
  });

  test("removes lagging redundant inline fragment", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          ... on User {
            ... @custom {
              handle
            }
            name
          }
          ... @custom {
            handle
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          ... @custom {
            handle
          }
          ... on User {
            name
          }
        }
      }"
    `);
  });
});

describe("No Lagging Redundant Interface Selection List", () => {
  test("removes one lagging redundant field list of length 1", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          ... on User {
            friends {
              name
            }
            handle
          }
          handle
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          ... on User {
            friends {
              name
            }
          }
          handle
        }
      }"
    `);
  });

  test("removes multiple lagging redundant field list of length > 1", () => {
    const source = /* GraphQL */ `
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
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          ... on User {
            friends {
              name
            }
          }
          __typename
          handle
        }
      }"
    `);
  });

  test("removes lagging redundant field list in fragment spreads", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          ...UserFragment
          handle
        }
      }

      fragment UserFragment on User {
        friends {
          name
        }
        handle
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          ... on User {
            friends {
              name
            }
          }
          handle
        }
      }"
    `);
  });

  test("removes lagging redundant field list with selection set", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          ... on User {
            friends {
              name
            }
            followers {
              count
            }
          }
          followers {
            count
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          ... on User {
            friends {
              name
            }
          }
          followers {
            count
          }
        }
      }"
    `);
  });

  test("removes lagging redundant inline fragment list", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          ... on User {
            name
            ... @custom {
              handle
            }
          }
          ... @custom {
            handle
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          ... on User {
            name
          }
          ... @custom {
            handle
          }
        }
      }"
    `);
  });
});

test.skip("No Repeated Interface Selections in Exhaustive Fragment List", () => {});

describe("No Constant @skip Directive", () => {
  test("reduces inline fragments without a type condidition", () => {
    const source = /* GraphQL */ `
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
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          name
          friends {
            name
          }
        }
      }"
    `);
  });

  test("leaves inline fragments in place with a type condidition", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          ... on User @skip(if: true) {
            name
          }
          ... on Organization @skip(if: false) {
            members {
              name
            }
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          ... on User @skip(if: true) {
            name
          }
          ... on Organization @skip(if: false) {
            members {
              name
            }
          }
        }
      }"
    `);
  });
});

describe("No Constant @include Directive", () => {
  test("reduces inline fragments without a type condidition", () => {
    const source = /* GraphQL */ `
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
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        user(id: 4) {
          name
          birthday
        }
      }"
    `);
  });

  test("leaves inline fragments in place with a type condidition", () => {
    const source = /* GraphQL */ `
      {
        profile(id: 4) {
          ... on User @include(if: true) {
            name
          }
          ... on Organization @include(if: false) {
            members {
              name
            }
          }
        }
      }
    `;
    expect(print(normalize(source, schema))).toMatchInlineSnapshot(`
      "{
        profile(id: 4) {
          ... on User @include(if: true) {
            name
          }
          ... on Organization @include(if: false) {
            members {
              name
            }
          }
        }
      }"
    `);
  });
});

test.skip("Ordered Definitions", () => {});

test.skip("Ordered Variable Definitions", () => {});

test.skip("Ordered Arguments", () => {});

test.skip("Ordered Input Object Values", () => {});
