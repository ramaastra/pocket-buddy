FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/api ./cmd/server
FROM alpine:3.22
RUN apk add --no-cache ca-certificates
COPY --from=build /out/api /api
EXPOSE 8080
ENTRYPOINT ["/api"]
