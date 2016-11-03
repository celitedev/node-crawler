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
  {
    template: 'runCrawler',
    name: 'runCrawler:1iota:event:weekly',
    frequency: '0 0 * * MON',
    data: {
      crawler: '1iota:event'
    }
  },
  {
    template: 'runCrawler',
    name: 'runCrawler:coursehorse:course:weekly',
    frequency: '0 12 * * MON',
    data: {
      crawler: 'coursehorse:course'
    }
  },
  {
    template: 'runCrawler',
    name: 'runCrawler:coursehorse:event:weekly',
    frequency: '0 0 * * TUE',
    data: {
      crawler: 'coursehorse:event'
    }
  },
  {
    template: 'runCrawler',
    name: 'runCrawler:eventful:event:weekly',
    frequency: '0 12 * * TUE',
    data: {
      crawler: 'eventful:event'
    }
  },
  {
    template: 'runCrawler',
    name: 'runCrawler:eventful:organizationandperson:weekly',
    frequency: '0 0 * * WED',
    data: {
      crawler: 'eventful:organizationandperson'
    }
  },
  {
    template: 'runCrawler',
    name: 'runCrawler:eventful:placewithopeninghours:weekly',
    frequency: '0 12 * * WED',
    data: {
      crawler: 'eventful:placewithopeninghours'
    }
  },
  {
    template: 'runCrawler',
    name: 'runCrawler:fandango:event:weekly',
    frequency: '0 0 * * THU',
    data: {
      crawler: 'fandango:event'
    }
  },
  {
    template: 'runCrawler',
    name: 'runCrawler:fandango:movie:weekly',
    frequency: '0 12 * * THU',
    data: {
      crawler: 'fandango:movie'
    }
  },
  {
    template: 'runCrawler',
    name: 'runCrawler:fandango:placewithopeninghours:weekly',
    frequency: '0 0 * * FRI',
    data: {
      crawler: 'fandango:placewithopeninghours'
    }
  },
  {
    template: 'runCrawler',
    name: 'runCrawler:nyc:attractions:weekly',
    frequency: '0 12 * * FRI',
    data: {
      crawler: 'nyc:attractions'
    }
  },
  {
    template: 'runCrawler',
    name: 'runCrawler:nyc:nightlife:weekly',
    frequency: '0 0 * * SAT',
    data: {
      crawler: 'nyc:nightlife'
    }
  },
  {
    template: 'runCrawler',
    name: 'runCrawler:nyc:restaurants:weekly',
    frequency: '0 12 * * SAT',
    data: {
      crawler: 'nyc:restaurants'
    }
  },
  {
    template: 'runCrawler',
    name: 'runCrawler:nyc:stores:weekly',
    frequency: '0 0 * * SUN',
    data: {
      crawler: 'nyc:stores'
    }
  },
  {
    template: 'runCrawler',
    name: 'runCrawler:seatgeek:event:weekly',
    frequency: '0 12 * * SUN',
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