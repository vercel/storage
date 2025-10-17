CREATE TABLE users (
  id SERIAL,
  name VARCHAR(255),
  email VARCHAR(255),
  image VARCHAR(255),
  createdAt TIMESTAMP
);

INSERT INTO users (name, email, image) VALUES (
  'Guillermo Rauch',
  'rauchg@vercel.com',
  'https://pbs.twimg.com/profile_images/1576257734810312704/ucxb4lHy_400x400.jpg'
),
(
  'Lee Robinson',
  'lee@vercel.com',
  'https://pbs.twimg.com/profile_images/1587647097670467584/adWRdqQ6_400x400.jpg'
),
(
  'Steven Tey',
  'stey@vercel.com',
  'https://pbs.twimg.com/profile_images/1506792347840888834/dS-r50Je_400x400.jpg'
);