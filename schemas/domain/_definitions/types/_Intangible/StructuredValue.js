module.exports = {
	//Signal to datamodels that this types + subtypes do not have identity. 
	//This likely results in these types being embedded at all times instead of being referenced.  
	//Ultimately this decision lies with the datamodel generation schemas though.
	//https://github.com/Kwhen/crawltest/issues/56
	isValueObject: true
};
