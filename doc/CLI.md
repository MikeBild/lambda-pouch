# Command Line Interface

## Start Script-Server (default port 3000)

```bash
lambda-pouch
```

## Set HTTP port

```bash
lambda-pouch --port 3000
```

## Show CLI help

```bash
lambda-pouch --help
```

## Enable JWT Authentication

```bash
lambda-pouch --secret <string>
```

## Sync data with a CouchDB/PouchDB URL

```bash
lambda-pouch --remote http://username:password@mycouch.example.com
```

## Show current version

```bash
lambda-pouch --version
```

## Sign a JSON Web Token

```bash
lambda-pouch --sign <string>
```

## Migrate a custom JS function file

```bash
lambda-pouch --function <filename>
```

## Migrate a static content file

```bash
lambda-pouch --static <filename>
```
