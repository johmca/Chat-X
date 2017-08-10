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
// If unspecified here, the TONE_ANALYZER_USERNAME and TONE_ANALYZER__PASSWORD env properties
// will be checked. After that, the SDK will fall back to the bluemix-provided VCAP_SERVICES
// environment property i.e. if tunning locally it will use credentials from the .env file
// but if running in Bluemix it will use those provided by Bluemix
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

//*********************** API ENDPOINT for POST **********************************************
// Listen for POST messages coming from the clients at API Endpoint = /api/message
// Execute the call back function defined here on receipt of message
//********************************************************************************************
app.post('/api/message', function(req, res) {

//console.log(`Context object just as it is received from POST = ${JSON.stringify(req.body.context, null, 2)}`);

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

  //Determine client type from message received on POST (FUTURE DEV)
  //var clientType = req.body.context.clientType;


//*********************************************************************
//Pass the user utterance through the Tone Analyser service and append
//the dominant tone that is returned into the Conversation context object
//then call the Conversation service before manipulating its response
//************************************************************************

//If the user utterance does not exist (first round of conversation) then
//force it to be a greeting to get it through TA as it will not handle an
//empty input
  if (!req.body.input) {
    console.log('req.body.input is blank');
    req.body.input = {
      "text":"Hi"
    };

//Initialise dominantTone object in the context (This should be done in Conversation)
    req.body.context = {
      "dominantTone":{
        "score": 0.0,
        "tone_id": "",
        "tone_name": ""
      }
    };
  }

  if (req.body.input.text) {
    //console.log('User utterance ='+ req.body.input.text);
    //Construct input parameter for call to TA service
    var userUtterance = {
      "utterances": [
        {
        "text": req.body.input.text,
        "user": "customer"
        }
      ]
    }
   //console.log(`Context object from PREVIOUS conversation not yet including LATEST Tones = ${JSON.stringify(req.body.context, null, 2)}`);

  //Call the TA service passing user utterance object and callback function to invoke when it
  //returns (the callback includes the call to Conversation)
  toneAnalyzer.tone_chat(userUtterance, (err, response) => {
    if (err) {
      //return next(err); //what does next() do in original code?
      //console.log(`Call to Tone Analyser failed with error ${err}`)
      return(err);
      }
      //console.log(`Response from TA = ${JSON.stringify(response, null, 2)}`);

      //Loop round array of tones returned selecting the one with highest score
      //as the dominant tone
      var maxScore = 0.0;
      var dominantTone = {
        "score":0,
        "tone_id":null,
        "tone_name":null
      };
      response.utterances_tone[0].tones.forEach(function(tone) {
        //console.log(`Tone info1 = ${tone.score} ${tone.tone_id} ${tone.tone_name}`);
        if (tone.score > maxScore) {
          dominantTone = tone;
          //console.log(`New domimant tone ${JSON.stringify(tone, null, 2)}`);
        }
      });

      //Insert dominant tone into the conversation context object
      req.body.context.dominantTone=dominantTone;

      //console.log(`Context object from PREVIOUS conversation round now updated to inlcude Tone of user's latest utterance = ${JSON.stringify(req.body.context, null, 2)}`);

      //***********************
      //Invoke the Conversation service within callback from TA service
      //to keep synchronised - passing in the dominant Tone of users latest
      //utterance ithin the context object
      //(re-write this with promisses if you get time)
      //************************

      //Construct payload object with workspace id, conversation context (received
      // in POST body and updated with tone) and user's latest input (received in POST body)
      var payload = {
        workspace_id: workspace,
        context: req.body.context || {},
        input: req.body.input || {}
      };

      // Send the payload to the conversation service and return the message
      // back to the client after checking confidence of the response (if
      // confidence is too low we replace the response from Conversation with
      // another message asking the user to clarify)
      conversation.message(payload, function(err, data) {
        if (err) {
          return res.status(err.code || 500).json(err);
        }

        //console.log(`Context object from LATEST conversation round = ${JSON.stringify(data, null, 2)}`);

      //Record user feedback to database (doesn't matter that this executes asynch - not dependent on it to pass message back)
        recordFeedback(data);

      //Return response to client (also update message if low on confidence)
        return res.json(updateMessage(payload, data));

      //END OF CALL TO CONVERSATION
      });

  //end of call to TA
    });
  }
//END OF P
});

/*******************************************************************
/* Function : recordFeedback
/******************************************************************
This function willcheck for user feedback and if found will record
this in the database

Updates the response text using the intent confidence
  @param  {Object} response The response from the Conversation service
  @return none
 ********************************************************************/

function recordFeedback(response) {
  // console.log(`Running recordFeedback().....`);
  // console.log(`Printing context ${JSON.stringify(response.context, null, 2)}`);
  if (response.context.feedbackText!='none' && response.context.userEmail!='none' ) {

  //Send feedback to TA service to understand tone
    var userUtterance = {
      "utterances": [
        {
        "text": response.context.feedbackText,
        "user": "customer"
        }
      ]
    }

  //Call the TA service passing user utterance object and callback function
  // toneAnalyzer.tone_chat(userUtterance, (err, response) => {
  //   if (err) {
  //     console.log(`Call to Tone Analyser failed with error ${err}`)
  //     return(err);
  //     }
  //
  //     //Loop round array of tones returned selecting the one with highest score
  //     //as the dominant tone
  //     var maxScore = 0.0;
  //     var dominantTone = {
  //       "score":0,
  //       "tone_id":null,
  //       "tone_name":null
  //     };
  //     response.utterances_tone[0].tones.forEach(function(tone) {
  //       //console.log(`Tone info1 = ${tone.score} ${tone.tone_id} ${tone.tone_name}`);
  //       if (tone.score > maxScore) {
  //         dominantTone = tone;
  //       }
  //     });
  //     return dominantTone
  //   });



    console.log('Saving feedback to database...');
    console.log(`User feedback = ${response.context.feedbackText}`);
    console.log(`User feedback email = ${response.context.userEmail}`);
    //console.log(`Tone of feedback=${JSON.stringify(dominantTone, null, 2)}`);

    //Reset context variables
    response.context.feedbackText ="none";
    response.context.userEmail ="none";
  }
  return;
}

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

  //Demo feature -
  //    There are some nodes in the dialogue where we are happy to just accept
  //    the response from Watson at face value i.e. we don't care if Watson is
  //    not confident. List these in an array for checking. Check if the node
  //    that has just spoken is in the list. If so return its utterance without
  //    over-riding
  var confidenceCheckExceptionDialogues = ['Negative Emotion','Capture User Feedback and ask for email address'];

  // if (response.output.nodes_visited[0]=='Negative Emotion') {
  //   //console.log('Negative emotion encountered');
  //   return response;
  // }
  if (confidenceCheckExceptionDialogues.includes(response.output.nodes_visited[0])) {
      //console.log('Negative emotion encountered');
      return response;
  }

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
    // user's intent . In these cases it is usually best to return a disambiguation message.
      if (intent.confidence <= confidenceThreshold) {
          additionalText = 'I think your intent was '+intent.intent +' but my confidence is low at '+ intent.confidence + '. I\'m still learning so please be patient with me. Can you please rephrase and ask me again.';
          textFromConversation='';
      }
  }
  response.output.text = additionalText+textFromConversation;
  return response;
}

module.exports = app;
