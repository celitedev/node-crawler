// A collection of music tracks.
module.exports = {
	properties: {
		byArtist: { //type = MusicGroup. Can also be solo artist
			isMulti: true
		},
		// albumProductionType: MusicAlbumProductionType,
		// albumReleaseType: MusicAlbumReleaseType , 


		// Commented-out because wanted to disable 'MusicRelease' for time being
		// albumRelease: { //MusicRelease
		// 	isMulti: true
		// }
	}
};
