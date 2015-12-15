// A collection of music tracks.
module.exports = {
	properties: {
		byArtist: { //type = MusicGroup. Can also be solo artist
			isMulti: true
		},
		// albumProductionType: MusicAlbumProductionType,
		// albumReleaseType: MusicAlbumReleaseType , 
		albumRelease: { //MusicRelease
			isMulti: true
		}
	}
};
