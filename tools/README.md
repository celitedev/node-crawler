# Notes on running locally
## To run locally you must be running the following:
* Redis (start with `$ redis-server --daemonize yes`)
* Elasticsearch (start with `$ /usr/local/Cellar/elasticsearch22/2.2.2/libexec/bin/elasticsearch -d`)
_note, this is configured by default to point to :9201 so as to avoid conflict with default ES server, you may need to edit your elasticsearch config or the dev config for this project if you are not running muliple ES instances
* RethinkDB (start from the root of the crawl-test project with `$ rethinkdb`)
* API server (start with `node server`)
## To run crawlers locally, you also need:
* TORS Proxy (start with `docker run -d -p 5566:5566 -p 1936:1936 --env tors=25 mattes/rotating-proxy`, see #254, not kwhen repo does not work)

