var request = require('request'),
	mongoose = require('mongoose'),
	userSchema = new mongoose.Schema({ slackId: String, gistToken: String });

function checkDatabaseInitialized(context, callback) {
	if (!this.dbInitialized) {
		if (!this.GistUser) {
			this.GistUser = mongoose.model('GistUser', userSchema);
		}

		mongoose.connect(context.data.GIST_CONNECTION);
		this.db = mongoose.connection;
		this.db.on('error', function (err) {
			if (err) {
				callback(err);
			}

			return;
		});

		this.db.once('open', function (cb) {
			console.log('Database initialized.');
			this.dbInitialized = true;
		});
	}
}


/** WEBTASK **/
module.exports = function (context, callback) {
	var slackId = context.data.user_id,
		gistToken = context.data.text,
		incomingToken = context.data.token,
		slackToken = context.data.SLACK_TOKEN;	
	
	// First we validate that the request comes from our Slack Command	
	if (incomingToken !== slackToken) {
		callback('Invalid token. Unauthorized.');
		return;
	}
	
	// Validate that incoming data is valid	
	if (!slackId || !gistToken) {
		callback('Unknown user or token not found');
		return;
	}

	checkDatabaseInitialized(context, callback);
	var data = { slackId: slackId, gistToken: gistToken };

	this.GistUser.findOne({ slackId: slackId }, function (err, user) {
		if (err) {
			callback('Unable to retrieve gist user from the database');
			return;
		}

		if (user) {
			// Gist user found. Update its token
			user.gistToken = gistToken;
			user.slackId = slackId;
			user.save(function (err, data) {
				if (err) {
					callback(err);
					return;
				}
				
				console.log(JSON.stringify(data));
				callback(null, 'Gist token updated! Token: ' + gistToken);
			});
		} else {
			var newUser = new this.GistUser(data);
			newUser.save(function (err, data) {
				if (err) {
					callback(err);
					return;
				}

				callback(null, 'Gist token registered! Token: ' + gistToken);
			});
		}
	});
}