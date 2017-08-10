/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var express = require('express'); // app server
var bodyParser = require('body-parser'); // parser for post requests
var Conversation = require('watson-developer-cloud/conversation/v1'); // watson sdk - Conversation
const ToneAnalyzerV3 = require('watson-developer-cloud/tone-analyzer/v3'); // watson sdk - Tone Analyser


var app = express();//New express app

// Bootstrap application settings
app.use(express.static('./public')); // load UI from public folder
app.use(bodyParser.json());

// Create the service wrapper for Tone Analyser
const toneAnalyzer = new ToneAnalyzerV3({
  version_date: '2016-05-19',
});

// Create the service wrapper for Conversation
var conversation = new Conversation({
  // If unspecified here, the CONVERSATION_USERNAME and CONVERSATION_PASSWORD env properties will be checked
  // After that, the SDK will fall back to the bluemix-provided VCAP_SERVICES environment property
  // username: '<username>',
  // password: '<password>',
  // url: 'https://gateway.watsonplatform.net/conversation/api',
  version_date: Conversation.VERSION_DATE_2017_04_21
});


// Listen for POST messages coming from the clients at API Endpoint = /api/message
app.post('/api/message', function(req, res) {

  //If the.env file has not been updated correctly then return errors
  //You need to update the placeholders with the workspace id from your workspace and
  //the user id and password from your intsance of the Conversation service
  var workspace = process.env.WORKSPACE_ID || '<workspace-id>';
  var conversationUsername = process.env.CONVERSATION_USERNAME || '<conversation-username>';
  var conversationPassword = process.env.CONVERSATION_PASSWORD || '<conversation-password>';

  if (!workspace || workspace === '<workspace-id>') {
    return res.json({
      'output': {
        'text': 'The app has not been configured with a <b>WORKSPACE_ID</b> environment variable.'
      }
    });
  }
  if (!conversationUsername || conversationUsername === '<conversation-username>') {
    return res.json({
      'output': {
        'text': 'The app has not been configured with a <b>CONVERSATION_USERNAME</b> environment variable.'
      }
    });
  }
  if (!conversationPassword || conversationPassword  === '<conversation-password>') {
    return res.json({
      'output': {
        'text': 'The app has not been configured with a <b>CONVERSATION_PASSWORD</b> environment variable.'
      }
    });
  }

  //Determine client type from message received on POST
  var clientType = req.body.context.clientType;

  //***********************
  //Pass the user utterance into the Tone Analyser service
  //************************

  //Invoke Tone Analyser but only if there is a user utterance to analyse
  //
  if (req.body.input.text) {
    console.log('User utterance ='+ req.body.input.text);
    var userUtterance = {
      "utterances": [
      {
        "text": req.body.input.text,
        "user": "customer"
      }
    ]
  }
  toneAnalyzer.tone_chat(userUtterance, (err, response) => {
  if (err) {
    //return next(err); //what does next() do in original code?
    console.log(`Tone Analyser failed with error ${err}`)
    return(err);
    }
    console.log(JSON.stringify(response, null, 2));
    //return res.json(response);




  });
}
console.log('Finished calling TA ..next call Conversation...');


  //***********************
  //Invoke the Conversation service
  //************************

  //Construct payload object with workspace id, conversation context (received
  // in POST body and updated with tone analysis) and user's latest input (received in POST body)
  var payload = {
    workspace_id: workspace,
    context: req.body.context || {},
    input: req.body.input || {}
  };

  // Send the payload to the conversation service and return the message
  // back to the client after checking confidence of the response (if
  // confidence is too low we send another message asking the user
  // to clarify)
  conversation.message(payload, function(err, data) {
    if (err) {
      return res.status(err.code || 500).json(err);
    }
    //Return response to client
    return res.json(updateMessage(payload, data));
  });
});

/******************************************************************
/* Function : updateMessage
/******************************************************************
This function can be used to alter the response from Conversation
before returning it to the client

Updates the response text using the intent confidence
  @param  {Object} input The request to the Conversation service
  @param  {Object} response The response from the Conversation service
  @return {Object}          The response with the updated message
 ********************************************************************/

function updateMessage(input, response) {
  //Retrieve confidence threshold from environment file - use 0.5 if not defined
  var confidenceThreshold = process.env.CONFIDENCE_THRESHOLD|| 0.5;
  if (confidenceThreshold == '<confidence-threshold>') {
    confidenceThreshold = 0.5;
  }

  var responseText = null;
  //console.log(`Running updateMessage ${response.output.text}`);
  if (!response.output) {
    response.output = {};
    return response;
  }

  var textFromConversation = response.output.text;
  var additionalText='';
  if (response.intents && response.intents[0]) {
    var intent = response.intents[0];
    // Depending on the confidence of the response the app can return different messages.
    // The confidence will vary depending on how well the system is trained. The service will always try to assign
    // a class/intent to the input. If the confidence is low, then it suggests the service is unsure of the
    // user's intent . In these cases it is usually best to return a disambiguation message
    // ('I did not understand your intent, please rephrase your question', etc..)
    // if (intent.confidence >= 0.75) {
    //   additionalText = 'I understood your intent was ' + intent.intent + 'with confidence of' + intent.confidence;
    // } else if (intent.confidence >= 0.5 ) {
    //   additionalText = 'I think your intent was ' + intent.intent + 'with confidence of '+ intent.confidence;
    // } else {
    //   additionalText = 'I think your intent was '+intent.intent +' but my confidence is low at '+ intent.confidence + '. I\'m still learning so please be patient with me. Can you please rephrase and ask me again.';
    // }

      if (intent.confidence <= 0.6) {
          additionalText = 'I think your intent was '+intent.intent +' but my confidence is low at '+ intent.confidence + '. I\'m still learning so please be patient with me. Can you please rephrase and ask me again.';
          textFromConversation='';
      }

  }
  response.output.text = additionalText+textFromConversation;
  return response;
}

module.exports = app;
