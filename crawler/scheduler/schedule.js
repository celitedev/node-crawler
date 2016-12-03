var schedule = [
  // {
  //   template: 'testJob',
  //   name: 'TEST',
  //   frequency: '5 seconds',
  //   data: {
  //     something: 'something',
  //     nothing: ''
  //   }
  // },
  { //expected duration: 5 min
    template: 'runCrawler',
    name: 'runCrawler:1iota:event:weekly',
    frequency: '0 0 * * MON',
    data: {
      crawler: '1iota:event'
    }
  },
  // { //expected duration: ?? hours //TODO moved to coursehorse_only_crawler_config branch for now
  //   template: 'runCrawler',
  //   name: 'runCrawler:coursehorse:course:weekly',
  //   frequency: '0 1 * * MON',
  //   data: {
  //     crawler: 'coursehorse:course'
  //   }
  // },
  // { //expected duration: ?? hours
  //   template: 'runCrawler',
  //   name: 'runCrawler:coursehorse:event:weekly',
  //   frequency: '0 12 * * MON',
  //   data: {
  //     crawler: 'coursehorse:event'
  //   }
  // },
  { //expected duration: 48 hours
    template: 'runCrawler',
    name: 'runCrawler:eventful:event:weekly',
    frequency: '0 12 * * TUE',
    data: {
      crawler: 'eventful:event'
    }
  },
  { //expected duration: ?? hours
    template: 'runCrawler',
    name: 'runCrawler:eventful:organizationandperson:weekly',
    frequency: '0 12 * * THU',
    data: {
      crawler: 'eventful:organizationandperson'
    }
  },
  { //expected duration: 48 hrs
    template: 'runCrawler',
    name: 'runCrawler:eventful:placewithopeninghours:weekly',
    frequency: '0 12 * * SAT',
    data: {
      crawler: 'eventful:placewithopeninghours'
    }
  },
  { //expected duration: 2 hours
    template: 'runCrawler',
    name: 'runCrawler:fandango:event:3xweekly',
    frequency: '0 0 * * 2,4,6',
    data: {
      crawler: 'fandango:event'
    }
  },
  { //expected duration: 2 hours
    template: 'runCrawler',
    name: 'runCrawler:fandango:movie:3xweekly',
    frequency: '0 3 * * 2,4,6',
    data: {
      crawler: 'fandango:movie'
    }
  },
  { //expected duration: 2 hours
    template: 'runCrawler',
    name: 'runCrawler:fandango:placewithopeninghours:3xweekly',
    frequency: '0 6 * * 2,4,6',
    data: {
      crawler: 'fandango:placewithopeninghours'
    }
  },
  { //expected duration: 1 hour
    template: 'runCrawler',
    name: 'runCrawler:nyc:attractions:weekly',
    frequency: '0 0 * * FRI',
    data: {
      crawler: 'nyc:attractions'
    }
  },
  { //expected duration: 1 hour
    template: 'runCrawler',
    name: 'runCrawler:nyc:nightlife:weekly',
    frequency: '0 2 * * FRI',
    data: {
      crawler: 'nyc:nightlife'
    }
  },
  { //expected duration: 1 hour
    template: 'runCrawler',
    name: 'runCrawler:nyc:restaurants:weekly',
    frequency: '0 4 * * FRI',
    data: {
      crawler: 'nyc:restaurants'
    }
  },
  { //expected duration: 1 hour
    template: 'runCrawler',
    name: 'runCrawler:nyc:stores:weekly',
    frequency: '0 6 * * FRI',
    data: {
      crawler: 'nyc:stores'
    }
  },
  { //expected duration: 1 day
    template: 'runCrawler',
    name: 'runCrawler:seatgeek:event:weekly',
    frequency: '0 0 * * SUN',
    data: {
      crawler: 'seatgeek:event'
    }
  },


  // { //TODO overrides
  //   template: 'runCrawler',
  //   name: 'runCrawler:1iota:event:weekly',
  //   frequency: '0 0 0 ? * SUN *',
  //   data: {
  //     crawler: '1iota:event',
  //     overrides: {
  //       semantics: {
  //         pruneEntity: "true"
  //       }
  //     }
  //   }
  // },

];

module.exports = {
  schedule: schedule
};