//https://schema.org/Duration
// Quantity: Duration (use ISO 8601 duration format).
// TBD?? No property defined. So where's the actual value stored? 
module.exports = {
	//http://webmasters.stackexchange.com/questions/50358/how-to-set-itemprop-duration
	//This probably means we want to just have a string value for each property referencing
	//Duration
	removeProperties: ["bitrate", "duration", "fact", "tag"]
};
