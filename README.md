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
{ id: 'c2561987-a688-4dba-be74-b093f4a8f1a0',
  meta: 
   { source: 'Eventful',
     type: 'Event',
     crawl: 
      { batchId: '1',
        jobId: '1d5d0bd4-573f-4a8d-bc6c-56aa14e4adef',
        dateTime: '2015-11-26T19:01:34.378Z',
        crawlConfig: '0.1',
        typeSchema: '0.1' } },
  source: 
   { id: 'http://newyorkcity.eventful.com/events/aladdin-musical-new-york-/E0-001-061203646-1@2015112714',
     url: 'http://newyorkcity.eventful.com/events/aladdin-musical-new-york-/E0-001-061203646-1@2015112714' },
  payload: 
   { name: 'Aladdin The Musical New York',
     startDate: '2015-11-27T14:00:00',
     place: 
      { name: 'New Amsterdam Theatre',
        url: 'http://newyorkcity.eventful.com/venues/new-amsterdam-theatre-/V0-001-000112293-7',
        streetAddress: '214 West 42nd Street',
        addressLocality: 'New York',
        addressRegion: 'New York',
        postalCode: '10036' },
     performers: {} } }
````

