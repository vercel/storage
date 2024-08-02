# syntax=docker/dockerfile:1

FROM golang:1.22

WORKDIR /app

# pre-copy/cache go.mod for pre-downloading dependencies and only redownloading them in subsequent builds if they change
COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY ./ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /vercel-blob-local

EXPOSE 3001
CMD ["/vercel-blob-local"]
