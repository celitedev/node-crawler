module.exports = {
	redis: {
		host: "localhost",
		port: 6379
	},
	rethinkdb: {
		pool: true, //default = true
		//true is interesting:  When true, the driver will regularly pull data from the table server_status 
		//to keep a list of updated hosts, default false
		//TBD: check if useul to put to true.
		discovery: false,
		db: "kwhen", //default databse if non is mentioned
		servers: [{
			host: 'localhost',
			port: 28015
		}],
		buffer: 50,
		max: 1000
	}
};
