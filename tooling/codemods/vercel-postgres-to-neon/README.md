This is a [codemod](https://codemod.com) created with [`codemod init`](https://docs.codemod.com/deploying-codemods/cli#codemod-init).

## Using this codemod

You can run this codemod with the following command:

```bash
npx codemod vercel-postgres-to-neon
```

### Before

```ts
import { sql } from '@vercel/postgres';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse,
) {
  try {
    await sql`CREATE TABLE Pets ( Name varchar(255), Owner varchar(255) );`;
    const names = ['Fiona', 'Lucy'];
    await sql`INSERT INTO Pets (Name, Owner) VALUES (${names[0]}, ${names[1]});`;
  } catch (error) {
    return response.status(500).json({ error });
  }

  const pets = await sql`SELECT * FROM Pets;`;
  return response.status(200).json({ pets });
}
```

### After

```ts
import { neon } from '@neondatabase/serverless';
import { NextApiRequest, NextApiResponse } from 'next';

const sql = neon(process.env.POSTGRES_URL);

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse,
) {
  try {
    await sql`CREATE TABLE Pets ( Name varchar(255), Owner varchar(255) );`;
    const names = ['Fiona', 'Lucy'];
    await sql`INSERT INTO Pets (Name, Owner) VALUES (${names[0]}, ${names[1]});`;
  } catch (error) {
    return response.status(500).json({ error });
  }

  const pets = await sql`SELECT * FROM Pets;`;
  return response.status(200).json({ pets });
}
```
