/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Forge Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

'use strict'; // http://www.w3schools.com/js/js_strict.asp

// token handling in session
var token = require('./token');

// web framework
var express = require('express');
var router = express.Router();

var forgeSDK = require('forge-apis');

// forge config information, such as client ID and secret
var config = require('./config');

// this end point will logoff the user by destroying the session
// as of now there is no Forge endpoint to invalidate tokens
router.get('/user/logoff', function (req, res) {
    req.session.destroy();
    res.end('/');
});

// New part
// functions for storing and retrieving refresh token

var isRefreshing = false;
var requestsToCallBack = [];

function retrieveRefreshToken (callback) {
    var fs = require("fs");
    fs.readFile('access_info.txt', function read(err, data) {
        if (err)
            console.log("retrieveRefreshToken, error = " + err.message);

        console.log("retrieveRefreshToken = " + data);
        callback(data);
    });
}

function storeRefreshToken (info) {
    var fs = require("fs");
    fs.writeFile('access_info.txt', info, function (err) {
        if (err)
            console.log("storeRefreshToken, error = " + err.message);

        console.log("storeRefreshToken = " + info);
    });
}

// return the public token of the current user
// the public token should have a limited scope (read-only)
router.get('/user/refreshedtoken', function (req, res) {
    console.log("isRefreshing?")
    if (isRefreshing) {
        requestsToCallBack.push(res);
    } else {
        console.log("isRefreshing = true");
        isRefreshing = true;
        // read refresh_token and use it to create a new token,
        // otherwise return
        retrieveRefreshToken(function (refresh_token) {
            var auth = new forgeSDK.AuthClientThreeLegged(
                config.credentials.client_id,
                config.credentials.client_secret,
                config.callbackURL,
                config.scopePublic);
            /* Using setTimeout just for easier testing of multiple request coming in at the same time
            setTimeout(function () {
                auth.refreshToken({refresh_token: refresh_token})
                    .then(function (publicCredentials) {
                        storeRefreshToken(publicCredentials.refresh_token);
                        var tokenSession = new token(req.session);
                        tokenSession.setPublicCredentials(publicCredentials);
                        tokenSession.setPublicOAuth(auth);
                        var tp = tokenSession.getPublicCredentials() ? tokenSession.getPublicCredentials().access_token : "";
                        var te = tokenSession.getPublicCredentials() ? tokenSession.getPublicCredentials().expires_in : "";
                        console.log('Public token:' + tp);
                        res.json({ token: tp, expires_in: te });

                        for (var key in requestsToCallBack) {
                            var item = requestsToCallBack[key];
                            item.json({ token: tp, expires_in: te });
                            console.log("/user/refreshedtoken - callback - data");
                        }
                        requestsToCallBack = [];
                        console.log("isRefreshing = false");
                        isRefreshing = false;
                    })
                    .catch(function (error) {
                        res.end(JSON.stringify(error));

                        for (var key in requestsToCallBack) {
                            var item = requestsToCallBack[key];
                            item.end(JSON.stringify(error));
                            console.log("/user/refreshedtoken - callback - error");
                        }
                        requestsToCallBack = [];
                        console.log("isRefreshing = false");
                        isRefreshing = false;
                    });
            }, 3000);
            */
            auth.refreshToken({refresh_token: refresh_token})
                .then(function (publicCredentials) {
                    storeRefreshToken(publicCredentials.refresh_token);
                    var tokenSession = new token(req.session);
                    tokenSession.setPublicCredentials(publicCredentials);
                    tokenSession.setPublicOAuth(auth);
                    var tp = tokenSession.getPublicCredentials() ? tokenSession.getPublicCredentials().access_token : "";
                    var te = tokenSession.getPublicCredentials() ? tokenSession.getPublicCredentials().expires_in : "";
                    console.log('Public token:' + tp);
                    res.json({ token: tp, expires_in: te });

                    for (var key in requestsToCallBack) {
                        var item = requestsToCallBack[key];
                        item.json({ token: tp, expires_in: te });
                        console.log("/user/refreshedtoken - callback - data");
                    }
                    requestsToCallBack = [];
                    console.log("isRefreshing = false");
                    isRefreshing = false;
                })
                .catch(function (error) {
                    res.end(JSON.stringify(error));

                    for (var key in requestsToCallBack) {
                        var item = requestsToCallBack[key];
                        item.end(JSON.stringify(error));
                        console.log("/user/refreshedtoken - callback - error");
                    }
                    requestsToCallBack = [];
                    console.log("isRefreshing = false");
                    isRefreshing = false;
                });
        })
    }
});

// Old part

// return the public token of the current user
// the public token should have a limited scope (read-only)
router.get('/user/token', function (req, res) {
    console.log('Getting user token'); // debug
    var tokenSession = new token(req.session);
    // json returns empty object if the entry values are undefined
    // so let's avoid that
    var tp = tokenSession.getPublicCredentials() ? tokenSession.getPublicCredentials().access_token : "";
    var te = tokenSession.getPublicCredentials() ? tokenSession.getPublicCredentials().expires_in : "";
    console.log('Public token:' + tp);
    res.json({ token: tp, expires_in: te });
});

// return the forge authenticate url
router.get('/user/authenticate', function (req, res) {
    // redirect the user to this page
    var url =
        "https://developer.api.autodesk.com" +
        '/authentication/v1/authorize?response_type=code' +
        '&client_id=' + config.credentials.client_id +
        '&redirect_uri=' + config.callbackURL +
        '&scope=' + config.scopeInternal.join(" ");
    res.end(url);
});

// wait for Autodesk callback (oAuth callback)
router.get('/api/forge/callback/oauth', function (req, res) {
    var code = req.query.code;
    var tokenSession = new token(req.session);

    // first get a full scope token for internal use (server-side)
    var internalAuth = new forgeSDK.AuthClientThreeLegged(config.credentials.client_id, config.credentials.client_secret, config.callbackURL, config.scopeInternal);
    console.log(code);
    internalAuth.getToken(code)
        .then(function (internalCredentials) {

            tokenSession.setInternalCredentials(internalCredentials);
            tokenSession.setInternalOAuth(internalAuth);

            console.log('Internal token (full scope): ' + internalCredentials.access_token); // debug

            // then refresh and get a limited scope token that we can send to the client
            var publicAuth = new forgeSDK.AuthClientThreeLegged(config.credentials.client_id, config.credentials.client_secret, config.callbackURL, config.scopePublic);
            publicAuth.refreshToken(internalCredentials)
                .then(function (publicCredentials) {
                    storeRefreshToken(publicCredentials.refresh_token);

                    tokenSession.setPublicCredentials(publicCredentials);
                    tokenSession.setPublicOAuth(publicAuth);

                    console.log('Public token (limited scope): ' + publicCredentials.access_token); // debug
                    res.redirect('/');
                })
                .catch(function (error) {
                    res.end(JSON.stringify(error));
                });
        })
        .catch(function (error) {
            res.end(JSON.stringify(error));
        });
});

module.exports = router;