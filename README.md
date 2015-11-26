# Kwhen Crawler

The Kwhen Crawler is a distributed crawler used to fetch data from 3rd party websites and APIs. 
Crawlers are defined declaratively with JSON schema validated config-files. 

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
			typeSchemaVersion: outputMessageSchema.version, //specific version of the target message schema. 
		},
	},
	source: {
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
{ id: 'cb3e3f55-6e07-4d4a-bf70-89799916b217',
  meta: 
   { source: 'Eventful',
     type: 'Event',
     crawl: 
      { batchId: undefined,
        jobId: undefined,
        dateTime: '2015-11-26T18:57:49.684Z',
        crawlConfig: '0.1',
        typeSchema: '0.1' } },
  source: 
   { id: 'http://newyorkcity.eventful.com/events/foals-/E0-001-088106866-4',
     url: 'http://newyorkcity.eventful.com/events/foals-/E0-001-088106866-4' },
  payload: 
   { name: 'Foals',
     startDate: '2015-12-18T20:00:00',
     place: 
      { name: 'Terminal 5',
        url: 'http://newyorkcity.eventful.com/venues/terminal-5-/V0-001-000529171-2',
        streetAddress: '610 West 56th Street',
        addressLocality: 'New York',
        addressRegion: 'New York',
        postalCode: '10019' },
     performers: { name: 'Foals', url: 'http://concerts.eventful.com/Foals' } } }
````

