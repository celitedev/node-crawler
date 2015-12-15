//A music recording (track), usually a single song.
module.exports = {
	properties: {
		byArtist: {
			isMulti: true
		},
		// duration: duration
		inAlbum: {
			isMulti: true
		},
		inPlaylist: {
			isMulti: true
		},
		isrcCode: {}, //The International Standard Recording Code for the recording.
		recordingOf: {}
	}
};
