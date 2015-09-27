var request = require('request');

module.exports = function (context, callback) {
	var incomingToken = context.data.token,
		slackToken = context.data.SLACK_TOKEN,
		slackReplyUrl = context.data.SLACK_URL,
		sourceChannel = context.data.channel_name,
		command = context.data.text,
		filename = command && command.split(' ')[0] || '',		
		file = {};
	
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
	file[filename] = { content: command.replace(filename, '').trim()};
	console.log('Gist Data: ' + JSON.stringify(file[filename]));

	// Call Gist API to create a new gist
	request.post({
		headers: { 'User-Agent': 'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)' },
		url: 'https://api.github.com/gists',
		json: {	description: 'Generated gist from Slack',
			public: 'false',
			files: file
		}
	}, function (error, response, body) {
		if (error) {
			callback(error);
		} else if (!body) {
			callback('Unable to parse body from Gist');
		} else {
			// Gist created successfully. Now, let's notify Slack using an Incoming WebHook.
			var url = body.html_url;
			var payload = {
				attachments: [{
					fallback: 'Take a look at this Gist. ' + filename + ': <' + url + '>',
					pretext: 'Take a look at this Gist. ' + filename + ': <' + url + '>',
					color: 'good',
					fields: [{ title: filename, value: file[filename].content, short: false }]
				}]
			};

			// If a source channel is specified, send the response back to that channel
			if (sourceChannel && sourceChannel !== 'directmessage') {
				console.log('Slack channel found: ' + sourceChannel);				
				payload.channel = '#' + sourceChannel;
			}

			// Invoke the Slack Incoming WebHook
			request.post({ url: slackReplyUrl, form: { payload: JSON.stringify(payload) } }, function (error, response, body) {
				if (error) {
					callback('Unable to send reply back to Slack.');
				}

				callback(null, 'Gist created! ' + filename + ': <' + url + '>');
			});
		}
	});
}