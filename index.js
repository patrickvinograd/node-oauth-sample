const express = require('express');
const { Issuer, Strategy } = require('openid-client');
const passport = require('passport');
const process = require('process');
const session = require('express-session');
const request = require('request');

//const ROOT_URL = 'https://deptva-eval.okta.com/';
//const ROOT_URL = 'https://deptva-eval.okta.com/oauth2/default';
const ROOT_URL = 'https://dev-api.va.gov/oauth2';
//const ROOT_URL = 'http://localhost:7100/services/oauth2';
const secret = "oauth_test";
const API_URL = 'https://dev-api.va.gov'

function createClient() {
  Issuer.defaultHttpOptions = { timeout: 5000 };
  return Issuer.discover('https://dev-api.va.gov/oauth2/.well-known/openid-configuration').then(issuer => {
    return new issuer.Client({
      client_id: process.env.VETS_API_CLIENT_ID,
      client_secret: process.env.VETS_API_CLIENT_SECRET,
      redirect_uris: [
        callbackUrl,
      ],
    });
  });
}

function createClientStatic() {
  const vaIssuer = new Issuer({
    issuer: 'https://deptva-eval.okta.com/oauth2/default',
    authorization_endpoint: 'https://dev-api.va.gov/services/oauth2/v1/authorize',
    token_endpoint: 'https://dev-api.va.gov/services/oauth2/v1/token',
    userinfo_endpoint: 'https://dev-api.va.gov/services/oauth2/v1/userinfo',
    jwks_uri: 'https://dev-api.va.gov/services/oauth2/v1/keys',
  });
  return new vaIssuer.Client({
      client_id: process.env.VETS_API_CLIENT_ID,
      client_secret: process.env.VETS_API_CLIENT_SECRET,
      redirect_uris: [
        callbackUrl,
      ],
    });  
}

function configurePassport(client) {
  passport.serializeUser(function(user, done) {
    done(null, user);
  });

  passport.deserializeUser(function(user, done) {
    done(null, user);
  });

  passport.use('oidc', new Strategy(
    {
      client,
      params: {
        scope: 'openid profile offline_access service_history.read disability_rating.read launch/patient patient/AllergyIntolerance.read patient/Condition.read patient/DiagnosticReport.read patient/Immunization.read patient/Medication.read patient/MedicationOrder.read patient/MedicationStatement.read patient/Observation.read patient/Patient.read patient/Procedure.read',
      },
    }, (tokenset, userinfo, done) => {
      user = Object.assign(userinfo, tokenset);
      console.log('user', user);
      done(null, user);
    }
  ));

  return client;
}

function startApp(client) {
  const app = express();
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(session({ secret: secret, saveUninitialized: true, resave: true, cookie: { maxAge: 60000 }}));
/*
  app.use(function (req, res, next) {
    if (!req.session.user) {
      req.session.user = {}
    }
   });
*/
  app.get('/', (req, res) => {
    if (req.session.user && req.session.user['given_name']) {
      res.send('Hello ' + req.session.user['given_name']);
    }
    else {
      res.send('Hello World!');
    }
  });
  app.get('/auth', passport.authenticate('oidc'),
    function(req, res) {
      console.log('/auth');
      console.log('req.user');
      console.log(req.user);
      req.session.user = Object.assign(req.session.user, req.user);
      console.log('req.session.user');
      console.log(req.session.user);
    });
  app.get('/auth/cb', passport.authenticate('oidc'),
    function(req, res) {
      console.log('/auth/cb');
      console.log('req.user');
      console.log(req.user);
      req.session.user = Object.assign(req.user);
      console.log('req.session.user');
      console.log(req.session.user);
      res.redirect('/');
    }
  );
  app.get('/auth/refresh', (req, res, done) => {
    console.log('/auth/refresh');
    console.log('req.user');
    console.log(req.user);
    console.log('req.session');
    console.log(req.session);
    client.refresh(req.session.user['refresh_token']).then(tokenset => {
      req.session.user = Object.assign(req.session.user, tokenset)
      console.log('refreshed and validated tokens', tokenset);
      console.log('req.session.user');
      console.log(req.session.user);
      res.send("Refreshed");
      done();
    });
  });
  app.get('/auth/introspect', (req, res, done) => {
    console.log('httpOptions %j', Issuer.defaultHttpOptions);
    console.log('/auth/introspect');
    console.log('req.user');
    console.log(req.user);
    console.log('req.session');
    console.log(req.session);
    client.introspect(req.session.user['access_token']).then(tokendata => {
      console.log('tokendata');
      console.log(tokendata);
      res.json(tokendata);
      done();
    });
  });
  app.get('/logout', (req, res, done) => {
    req.session.destroy();
    done();
  });
  app.get('/api/sh', (req, res, done) => {
    options = {
      url: API_URL + '/services/veteran_verification/v0/service_history',
      headers: { 'Authorization': 'Bearer ' + req.session.user['access_token'] }
    };
    request(options, function (error, response, body) {
          console.log('error:', error); // Print the error if one occurred and handle it
          console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
          res.send(body);
          done();
    });
  });
  app.get('/api/dr', (req, res, done) => {
    options = {
      url: API_URL + '/services/veteran_verification/v0/disability_rating',
      headers: { 'Authorization': 'Bearer ' + req.session.user['access_token'] }
    };
    request(options, function (error, response, body) {
          console.log('error:', error); // Print the error if one occurred and handle it
          console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
          res.send(body);
          done();
    });
  });


  app.listen(port, () => console.log(`Example app listening on port ${port}!`));
}

const port = process.env.PORT || 8080;
const callbackUrl = process.env.CALLBACK_URL || 'http://localhost:' + port + '/auth/cb';
createClient().then(configurePassport).then(startApp);
//var client = configurePassport(createClient())
//startApp(client);

