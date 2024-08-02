# Blob-Local

Blob-Local is a server for `@vercel/blob` which writes to the local filesystem instead of the cloud. It allows you to test and develop your applications locally without needing access to the hosted `@vercel/blob` store.

## Installation

First of all you should add these Environment Variables to you project so that the `@vercel/blob` SDK talks to your local server:

```bash
NEXT_PUBLIC_VERCEL_BLOB_API_URL=http://localhost:3001/api
VERCEL_BLOB_API_URL=http://localhost:3001/api
```

### Using a binary

Download the latest release from the [releases page](https://github.com/vercel/blob-local/releases), extract the archive and run the binary.

### Using Docker

Clone the repository:

```bash
git clone git@github.com:vercel/blob-local.git
cd blob-local
```

Build and run the container:

```bash
docker build --tag vercel-blob-local:latest .
docker run -d -p 3001:3001 --name vercel-blob-local vercel-blob-local:latest
```

After this you can start and stop the `vercel-blob-local` container like this:

```bash
docker start vercel-blob-local
docker stop vercel-blob-local
```

## Development

Clone the repository:

```bash
git clone git@github.com:vercel/blob-local.git
cd blob-local
```

Start the server:

```bash
ENV=dev go run main.go
```

If you want a watcher that restarts the server on file changes you can use something like [wgo](https://github.com/bokwoon95/wgo)

```bash
ENV=dev wgo run main.go
```
