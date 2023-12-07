# What is it?

```sh
pnpm i @vercel/tql
```

TQL is a lightweight library for writing SQL in TypeScript:

```ts
import { init, PostgresDialect } from '@vercel/tql';

const { query, fragment, identifiers, list, values, set, unsafe } = init({
  dialect: PostgresDialect,
});

const [q, params] = query`SELECT * FROM users`;
// output: ['SELECT * FROM users', []]
```

Its API is simple -- everything starts and ends with `query`, which returns a tuple of the compiled query string and parameters to pass to your database.

## A Primer on Tagged Templates

What is a tagged template in JavaScript? Quite simply, it's a function with the following signature:

```ts
function taggedTemplate(
  strings: TemplateStringsArray,
  ...values: unknown[]
): any {
  // just like any regular function, you can return anything from here!
}

const parameterName = 'strings';
const result = taggedTemplate`The stringy parts of this are split on the "holes" and passed in as the "${variableName}" array!`;
// strings = ['The stringy parts of this are split on the "holes" and passed in as the ", " array!"]
// values: ['strings']
```

This is good news for SQL! The values in `strings` can _only_ come directly from your code (as in, you as a developer definitely wrote them), which means they're always safe. We can then view the "holes" (anything between `${}`) as a doorway through which more-exotic, potentially-unsafe things can be safely passed into your query.

But how do we know what to do with the special values passed through the "doorways"? Let's break it down. We need two pieces of semantic information:

- The developer's intent (what should the query compiler do with this information?)
- The actual data being passed through

This is trivially easy to do with classes -- if we only allow subclasses of a parent class (called `TqlNode`) to be passed in, then we can do something simple like this when building our query tree:

```ts
if (!value instanceof TqlNode) {
  return new TqlParameter(value);
}
return value;
```

Now we know all of the values we have are instances of our parent class, we can use which specific subclass they are to determine what to do with them. For example, if the node is a `TqlParameter` node, we would add a `$1` (or whichever number it should have) into the query string and pass the `node.data` value into the parameters array.

## API

To start, you'll need to initialize the query compiler:

```ts
import { init, PostgresDialect } from '@vercel/tql';

const tql = init({ dialect: PostgresDialect });
```

Missing your dialect? Feel free to open a PR -- they're pretty easy to write!

Below, you can see the utilities returned from `init`, but here's a summary table:

| Utility       | Signature                                                                                                                            | Purpose                                                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query`       | `(strings: TemplateStringsArray, ...values: unknown[]) => [string, unknown[]]`                                                       | The top-level query object. Returns a tuple of the SQL query string and an array of parameters. Pass both of these to your database driver.                                                                                                                   |
| `fragment`    | `(strings: TemplateStringsArray, ...values: unknown[]) => [string, unknown[]]`                                                       | Has the same API as `query`, but returns a `TqlFragment` node which can be recursively nested within itself and included in a top-level `query`.                                                                                                              |
| `identifiers` | <code>(ids: string &#124; string[]) => TqlIdentifiers</code>                                                                         | Accepts a list of strings, escapes them, and inserts them into the query as identifiers (table or column names). Identifiers are safe and easy to escape, unlike query values! Will also accept a single identifier, for convenience.                         |
| `list`        | `(parameters: unknown[]) => TqlList`                                                                                                 | Accepts a list of anything and inserts it into the query as a parameterized list. For example, `[1, 2, 3]` would become `($1, $2, $3)` with the original values stored in the parameters array.                                                               |
| `values`      | `(entries: ValuesObject) => TqlValues`, where `ValuesObject` is `{ [columnName: string]: unknown }` or an array of that object type. | Accepts an array of records (or, for convenience, a single record) and builds a VALUES clause out of it. See the example below for a full explanation.                                                                                                        |
| `set`         | `(entry: SetObject) => TqlSet`, where `SetObject` is `{ [columnName: string]: unknown }`.                                            | Accepts a record representing the SET clause, and returns a parameterized SET clause. See example below for a full explanation.                                                                                                                               |
| `unsafe`      | `(str: string) => TqlTemplateString`                                                                                                 | Accepts a string and returns a representation of the string that will be inserted VERBATIM, UNESCAPED into the compiled query. Please, for all that is good, it's in the name -- this is unsafe. Do not use it unless you absolutely know your input is safe. |

Important: Anywhere you pass a single value into `query` or `fragment`, you can also pass in an array of values. They'll be treated just as if you'd simply interpolated them right next to each other, with all the same protections.

### Parameters

Anything directly passed into a template becomes a parameter. Essentially, the "holes" in the template are filled in with the dialect's parameter placeholder, and the value itself is passed directly into the parameters array:

```ts
const userId = 1234;
const [q, params] = query`SELECT * FROM users WHERE user_id = ${userId}`;
// output: ['SELECT * FROM users WHERE user_id = $1', [1234]]
```

### List parameters

Need to use list syntax?:

```ts
const userId = [1234, 5678];
const [q, params] = query`SELECT * FROM users WHERE user_id IN ${list(userId)}`;
// output: ['SELECT * FROM users WHERE user_id IN ($1, $2)', [1234, 5678]]
```

### Composable queries

Need to share clauses between queries, or do you just find it more convenient to build a specific query in multiple variable declarations? `fragment` is what you're looking for!

```ts
const userId = 1234;
const whereClause = fragment`WHERE user_id = ${userId}`;
const [q, params] = query`SELECT * FROM users ${whereClause}`;
// output: ['SELECT * FROM users WHERE user_id = $1', [1234]]
```

Fragments can be nested recursively, so the possibilities are endless.

If you need to combine a group of fragments, you can use `fragment.join`, which works a bit like Python's `String.join` API:

```ts
const maxAge = 30;
const minAge = 25;
const firstName = undefined;

const filters = [];
if (maxAge) filters.push(fragment`age < ${maxAge}`);
if (minAge) filters.push(fragment`age > ${minAge}`);
if (firstName) filters.push(fragment`firstName = ${firstName}`);

let whereClause = fragment``;
if (filters.length > 0) {
  joinedFilters = fragment` AND `.join(...filters);
  whereClause = fragment`WHERE ${joinedFilters}`;
}
const [q, params] = query`SELECT * FROM users ${whereClause};`;
// output: [
//   'SELECT * FROM users WHERE age < $1 AND age > $2;',
//   [30, 25]
// ]
```

### Identifiers

Need to dynamically insert identifiers?

```ts
const columns = ['name', 'dob'];
const [q, params] = query`SELECT ${identifiers(columns)} FROM users`;
// output: ['SELECT "name", "dob" FROM users', []]
```

Note: Dotted identifiers are escaped with all sides quoted, so `dbo.users` would become `"dbo"."users"`.

### VALUES clauses

Inserting records is a pain!

```ts
const users = [
  { name: 'vercelliott', favorite_hobby: 'screaming into the void' },
  { name: 'reselliott', favorite_hobby: 'thrifting' },
];
const [q, params] = query`INSERT INTO users ${values(users)}`;
// output: [
//   'INSERT INTO users ("name", "favorite_hobby") VALUES ($1, $2), ($3, $4)',
//   ['vercelliott', 'screaming into the void', 'reselliott', 'thrifting']
//  ]
```

`values` also accepts just one record instead of an array. If an array is passed, it will validate that all records have the same columns.

### SET clauses

Updating records can also be a pain!

```ts
const updatedUser = { name: 'vercelliott' };
const userId = 1234;
const [q, params] = query`UPDATE users ${set(
  updatedUser,
)} WHERE userId = ${userId}`;
// output: ['UPDATE users SET "name" = $1 WHERE userId = $2', ['vercelliott', 1234]]
```

### `unsafe`

This is just a tagged template that will be verbatim-inserted into your query. It _is_ unsafe, do _not_ pass unsanitized user input into it!

## I want to...

As people ask questions about how to do various things, I'll fill out this section as a sort of FAQ.
