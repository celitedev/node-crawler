# Kwhen Crawler

The Kwhen Crawler is a distributed crawler used to fetch data from 3rd party websites and APIs. 
Crawlers are defined declaratively with JSON schema validated config-files. 

##Installation and Setup

Node Version: 6.0.0

###We need 4 things to be installed to run Crawler locally:

- [RethinkDB](https://www.rethinkdb.com/)
- [Redis Server](http://redis.io/) 
- [Elasticsearch](https://www.elastic.co/downloads/elasticsearch) 
- [Docker](https://www.docker.com/products/docker) to use TORS Proxy 

####Installation Steps:
Install [Homebrew](http://brew.sh/) first to install RethinkDB and Redis with a single command.

1. **RethinkDb:** `$ brew update && brew install rethinkdb`

2. **Redis Server:** `$ brew install redis` 

3. **Elasticsearch:** 
a. Download and unzip Elasticsearch distribution. 
b. Run `./bin/elasticsearch -d` _note, this is configured by default to point to :9201 so as to avoid conflict with default ES server, you may need to edit your elasticsearch config or the dev config for this project if you are not running muliple ES instances_
                                _note, to rebuild the index:_ `node tools/populateERD --reset`
c. Test with: `curl -X GET http://localhost:9201/`

4. **Docker and TORS Proxy:**
TORS Proxy is been setup to run inside Docker directly.
a. Download and Install Docker.
b. Pull the kwhen-rotating-proxy repo: `docker pull jimedelstein/kwhen-rotating-proxy`
c. Run `docker run -d -p 5566:5566 -p 1936:1936 --env tors=25 jimedelstein/kwhen-rotating-proxy`
d. Test kwhen-rotating-proxy with `curl --proxy 127.0.0.1:5566 http://echoip.com`. This should return different ip-adresses each time you run. 


##Run crawltest in local(dev mode)
By default the config(crawltest/config.js) will set the environment as "dev". 
So, running `node server` is equivalent to `NODE_ENV=dev node server`.

Though in most of the documentation example is like: `NODE_ENV=prod node tools/createReferences`, it is strongly recommended to run it as `node tools/createReferences` or `NODE_ENV=dev node tools/createReferences`.

## Supported features

- highly distributed in nature.
- work is divided in mini-jobs which are posted on a distributed queue. 
- A mini-job consists of a crawl that crawls 1 list (master) url and all related entity (detail) urls. This
level of granularity seems to work nicely since a job is not too small (limiting unneeded overhead) and not
to big (crippling concurrency).
- the queue has at least once semantics, meaning a job is guaranteed to be processed but might be processed multiple times, in some edge-cases. (i.e.: consumers having persisted entities but crashing before job could be marked as done)
-  since output saved is idempotent, the system as a whole has exactly-once semantics.
- multiple consumers may consume simultenously from a queue
- a particular consumer can be scheduled to process jobs of all crawlers (default) or a subset (for testing purposes) 
- seeding of urls is controllable per crawler
- crawling is done with configurable speed, concurrency, proxies. WIP: controlling concurrency in distributed environment. Follow #12 for more info
- crawlers default to non-javascript (fast) but allow client-side javascript processing where needed on a per crawler basis. 
- sensible algorithms for detecting endless loops (something sites try to do to deter crawlers) as well as options for custom functions per source
- output is validated (Json Schema) giving more quality assurance when writing new crawlers.


## Output format

```javascript
{
	id, //msg id
	meta: {
		type: <eventType> e.g.: Event||Venue
		source: <crawlSource>, e.g.: Eventful
		crawl: {
			batchId: //
			jobId:
			createdAt: //dt
			crawlVersion:  //specific version for this schema, i.e.: Eventful Events v1.0
			typeVersion: outputMessageSchema.version, //specific version of the target message schema. 
		},
	},
	//identifiers are generic and always avail. 
	//They're used for various tasks such as lookup, pruning, et.c
	identifiers: {
		id, //if known. Otherwise url
		url
	},
	payload: {
		//specific to type
	}
}
```

Example

````javascript
{ id: 'ec2e3fdf-ffe6-4d44-beb4-ff92cba76277',
  meta: 
   { source: 'Eventful',
     type: 'Event',
     crawl: 
      { batchId: '1',
        jobId: '9eb83801-e756-4c58-b6a6-822f83b9878d',
        createdAt: '2015-11-26T19:12:05.209Z',
        crawlVersion: '0.1',
        typeVersion: '0.1' } },
  identifiers: 
   { id: 'http://newyorkcity.eventful.com/events/rihanna-travis-scott-/E0-001-089143485-7',
     url: 'http://newyorkcity.eventful.com/events/rihanna-travis-scott-/E0-001-089143485-7' },
  payload: 
   { name: 'Rihanna & Travis Scott',
     startDate: '2016-04-02T19:30:00',
     place: 
      { name: 'Prudential Center',
        url: 'http://newyorkcity.eventful.com/venues/prudential-center-/V0-001-000989370-3',
        streetAddress: '25 Lafayette Street',
        addressLocality: 'Newark',
        addressRegion: 'New Jersey',
        postalCode: '07102' },
     performers: { name: 'Rihanna', url: 'http://concerts.eventful.com/Rihanna' } } }

````

