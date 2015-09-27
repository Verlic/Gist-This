var request = require('request'),
	mongoose = require('mongoose'),
	GitHubApi = require('github@0.2.4'),
	github = new GitHubApi({
		// required
		version: "3.0.0",
		// optional
		debug: true,
		protocol: "https",
		host: "api.github.com", // should be api.github.com for GitHub
		pathPrefix: "", // for some GHEs; none for GitHub
		timeout: 5000,
		headers: {
			"user-agent": "My-Cool-GitHub-App" // GitHub is happy with a unique user agent
		}
	}),
	userSchema = new mongoose.Schema({ slackId: String, gistToken: String });

function notifySlack(url, gist, callback){
	// Gist created successfully. Now, let's notify Slack using an Incoming WebHook.	
	var payload = {
		attachments: [{
			fallback: 'Take a look at this Gist. ' + gist.filename + ': <' + url + '>',
			pretext: 'Take a look at this Gist. ' + gist.filename + ': <' + url + '>',
			color: 'good',
			fields: [{ title: gist.filename, value: gist.file[gist.filename].content, short: false }]
		}]
	};

	// If a source channel is specified, send the response back to that channel
	if (gist.sourceChannel && gist.sourceChannel !== 'directmessage') {
		console.log('Slack channel found: ' + gist.sourceChannel);				
		payload.channel = '#' + gist.sourceChannel;
	}

	// Invoke the Slack Incoming WebHook
	request.post({ url: gist.slackReplyUrl, form: { payload: JSON.stringify(payload) } }, function (error, response, body) {
		if (error) {
			callback('Unable to send reply back to Slack.');
		}

		callback(null, 'Anonymous Gist created! ' + gist.filename + ': <' + url + '>');
	});
}

function createAnonymousGist(gist, callback){
	request.post({
		headers: { 'User-Agent': 'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)' },
		url: 'https://api.github.com/gists',
		json: {	description: 'Generated gist from Slack',
			public: 'false',
			files: gist.file
		}
	}, function (error, response, body) {
		if (error) {
			callback('Error while creating gist:' + JSON.stringify(error));
		} else if (!body) {
			callback('Unable to parse body from Gist');
		} else {
			notifySlack(body.html_url, gist, callback);
		}
	});
}

function createUserGist(gistUser, gist, callback){
	console.log('Gist User: ' + JSON.stringify(gistUser));
	github.authenticate({
		type: 'oauth',
		token: gistUser.gistToken
	});
	
	var payload = {	
		description: 'Generated gist from Slack',
		public: 'false',
		files: gist.file
	};
	
	github.gists.create(payload, function(err, body){
		if (err) {
				callback('Error while creating gist:' + JSON.stringify(err));
			} else if (!body) {
				callback('Unable to parse body from Gist');
		}
		
		console.log('Gist created: ' + JSON.stringify(body));		
		notifySlack(body.html_url, gist, callback);
	});
}

function findGistUser(slackId, cb){
	this.GistUser.findOne({ slackId: slackId }, function (err, user) {
		if (err) {
			cb('Unable to retrieve gist user from the database');
			return;
		}

		cb(null, user);		
	});
}


module.exports = function (context, callback) {
	var incomingToken = context.data.token,
		command = context.data.text,
		slackToken = context.data.SLACK_TOKEN,
		gist = {
			slackId: context.data.user_id,			
			slackReplyUrl: context.data.SLACK_URL,
			sourceChannel: context.data.channel_name,
			file: {},
			filename: command && command.split(' ')[0] || '' 
		};
		
	// First we validate that the request comes from our Slack Command	
	if (incomingToken !== slackToken) {
		callback('Invalid token. Unauthorized.');
		return;
	}

	// Check for invalid command arguments.
	if (!command || command.split(' ').length < 2) {
		callback('Missing arguments. Please, include the file name and the content after the Slack command.');
		return;
	}
	
	// Create the gist file object
	gist.file[gist.filename] = { content: command.replace(gist.filename, '').trim()};
	console.log('Gist Data: ' + JSON.stringify(gist.file[gist.filename]));

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
	
	findGistUser(gist.slackId, function(err, gistUser){
		if (!gistUser){
			// Create an anonymous gist
			createAnonymousGist(gist, callback);
		}else{
			createUserGist(gistUser, gist, callback);
		}
	});
}