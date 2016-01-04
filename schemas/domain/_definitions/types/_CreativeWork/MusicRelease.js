//A MusicRelease is a specific release of a music album.
module.exports = {
	disable: true,
	properties: {
		catalogNumber: {},

		//The group the release is credited to if different than the byArtist. 
		//For example, Red and Blue is credited to "Stefani Germanotta Band", 
		//but by Lady Gaga.
		creditedTo: {},

		duration: {},
		// musicReleaseFormat: MusicReleaseFormatType 	
		recordLabel: {},
		releaseOf: {},
	}
};
