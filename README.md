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
