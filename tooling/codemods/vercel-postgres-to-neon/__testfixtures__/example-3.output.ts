// https://github.com/sauravhathi/vercel-postgres/blob/main/pages/api/pets.ts

import { NextApiRequest, NextApiResponse } from "next";
import { createPool } from "@vercel/postgres";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL);

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse,
) {
  try {
    await sql`CREATE TABLE Pets ( Name varchar(255), Owner varchar(255) );`;
    const names = ["Fiona", "Lucy"];
    await sql`INSERT INTO Pets (Name, Owner) VALUES (${names[0]}, ${names[1]});`;
  } catch (error) {
    return response.status(500).json({ error });
  }

  const pets = await sql`SELECT * FROM Pets;`;
  return response.status(200).json({ pets });
}
