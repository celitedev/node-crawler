# Schema Overview

Let's discuss the different types of schemas Kwhen uses and how they interact. 


## Some definitions


**TBD** 

- Entity-type (also *type* or sometimes *entity*)
- Entity-instance (also instance or sometimes *entity*). It should be clear from context if an *entity* is an *entity-instance* or an *entity-type*. We try to be 100% unambiguous though.
- Domain
- Entity-property (also *attribute*)



## Domain Schemas

Domain schemas define entity-types on a **Logical level**. 
Each entity-type, such as as *Place* has a distinct Domain Schema defining said entity-type. 

Domain-schemas are *the single authority* in the system. 
This means that all other schemas depend on domain-schemas and should obey all rules defined.

A Domain Schema defines: 

- possible and required properties, e.g.: a *Place* requires a *name* and has optional *openinghours*
- cardinality validation of properties, e.g.: a *Place* has 1 *name* but possibly has multiple *alternateName*
- property-validation, e.g.: a *Place* may have 1 *logo* specified as a String value that must be a valid URL. 


### Schema.org 

Domain Schemas define entity-types like *Place*, *Event*, *Person*, *Organization*. These are not unique to Kwhen. 
Kwhen doesn't live in isolation. Therefore we build our entity-types on top of the emerging de-facto standard [schema.org](http://www.schema.org). 

More specifically, where possible we use the schema.org definitions to build our Domain-schemas. For example
our *Place* domain-schema builds on top of schema.org's [Place](http://www.schema.org/Place). 

This has a lot of advantages: 

* We get well thought-out schemas for free. Hundreds of people have poured thousands of hours into defining these schemas. Let's leverage that.
* These cover 99% of all properties (on a domain/logical level) we'd ever need (100% until now but you never know)
* It's trivial to translate all our entity-instances to valid Schema.org models, which are used by Google, etc. to display RichSnippets. 

Moreover, Schema.orr are defined in a topology. I.e.: A LocalBusiness IS_A Place IS_A Thing. Travelling up this topology, properties become more generic. I.e. they are shared among more schemas. Or to put differently: Everything is a Thing. 

This is cool because this will give us the ability (with some serious tech effort but it will be worth it) to be able to query separate entity-types by the generic properties that they share. For instance, a Thing defines among other things *name* and *description*. In result a user will be able to query every entity-instance by *name* (remember everything is a Thing) regardless of it being a Place, an Event, a Person, etc. 


However, we need Domain Schemas instead of relying directly on schema.org schemas because: 

* we're able to lay extra validation (cardinality-rules + property-validation) on top
* per Domain-schema prune properties down to a bite-size level. Schema.org defines *loads* of properties, and although we can tap into all those properties when needed, on a day-to-day we want to work with clearly defined subsets. 
* we specifically build in the option to *add* additional properties not defined in schema.org. We haven't come across the need, but it's important to have this option available. NOTE: this is about domain-properties: properties that have a semantic meaning in the Domain Model. This doesn't cover, say, database-ids, etc. These are covered in the *DataModel Schemas* 
* Schema.org definitions change over time, which we don't control. We need a buffer (the domain schemas) so our models aren't directly affected by a change. 


### Domain schema generation

Complete Domain schemas including validation rules are generated periodically based on :

- schema.org definitions
- pruned by type as well as properties based on our need
- with added validation as described

During this generation, errors are automatically generated when schema.org schemas have inadvertently changed and are not compatible with our domain schemas anymore. This gives us the opportunity to either: 

1. manually migrate our domain schemas based on the updated schema.org definitions. Resulting in a new version
2. keep our definitions based on the outdated but working schema.org definitions.  

Note that going route 2. most of the time is no problem. The only thing that could happen is that generated schema.org data isn't 100% according to spec, resulting in some Richsnippets, etc. to be slightly off. 

Still over time we want to keep up-to-date with schema.org by migrating our schemas to be in line again. When we do, at least it's our own schedule, and can be performed during periodic updates of the system as whole. See **Schema migration / versioning and drift** for more on schema migration. 



## Datamodel schemas

For storing data into various datasources. 
Extra technical properties (such as id, lastModified) are added here. These live outside of the domain. 


Defines schemas: 

* per datasource 
* for entire polyglot facade. 


Responsibilities: 

- define if contained entities are linked by embedding or reference (type = @id). This needs 

**TBD**


## Eventmessage schemas

For various stages of data pipeline. 

**TBD**



## FilterContext schemas

Since both Datamodel schemas as well as FilterContext schemas are based on Domain Schemas, we can translate between the two automatically. 
This means we can automatically generate a query plan, based on a FilterContext. That's the idea anyway.

**TBD: Not sure Filtercontext schemas are needed**



## NLP Reverse Index schemas

Part of the Natural Language Query -> FilterContext translation is based on quickly finding terms in reverse indices. E.g.: adjectives such as *cosy, cool, relaxed*,  nouns such as *bar, restaurant* or proper nouns such as *The oxford club*. 

These reverse indices are auto-generated based on NLP Reverse Index Schemas, where each reverse index takes one of more entity-type properties (called *features* in the NLP realm) and analyzes/parses them in certain ways, e.g.: lowercase, etc. 

The NLP Reverse Index Schemas keep track of which index refers to which entity-types and properties as defined by the Domain schemas. Hence, there's these schemas help in discovering which properties are queried by a Natural Language question. Based on this it will be possible to create a FilterContext.



## Schema migration / versioning and drift

**TBD**

Most schema migration is pretty trivial (at least on a logical level) except for domain-schema migration.
That's because other schemas depend on domain-schemas, so when a domain-schema changes, a lot of dependent schema *might* need to change as well.
