# Master/Master Replication

Lambda-Pouch is completely self contained and designed to comfortable develop web and mobile frontends in a single or distributed node environment. Started by a simple "offline enabled" development environment, up to multiple high avalabile running instances behind a load balancer or reverse proxy. Shared data between multiple instances of an application has many tradeoffs. Rather than relying on a master/slave or cluster systems as a "single source of truth", Lambda-Pouch supports PouchDB-CouchDB's multi-master node replication. In a multi-node architecture Lambda-Pouch is partitioned, every node is available, and it's only eventually consistent. This behavior is intentional to build responsible user interfaces with a smooth user experience all the time.

## Enable synchronization

```bash
script-pouch --remote http://username:password@mycouch.example.com/<DB-prefix>
```

For further information read:

* [Eventual Consistency](http://docs.couchdb.org/en/1.6.1/intro/consistency.html)
* [PouchDB Replication Guide](https://pouchdb.com/guides/replication.html)
* [CouchDB Replication Intro](http://docs.couchdb.org/en/1.6.1/replication/intro.html)
