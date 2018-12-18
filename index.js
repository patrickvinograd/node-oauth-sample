const express = require('express');
const { Issuer, Strategy } = require('openid-client');
const passport = require('passport');
const process = require('process');
const session = require('express-session');
const request = require('request-promise-native');
const hbs = require('hbs');

//const OAUTH_URL = 'https://deptva-eval.okta.com/';
//const OAUTH_URL = 'https://deptva-eval.okta.com/oauth2/default';
//const OAUTH_URL = 'http://localhost:7100/services/oauth2';
const OAUTH_URL = process.env.OAUTH_URL || 'https://dev-api.va.gov/oauth2';
const secret = "oauth_test";
const API_URL = process.env.API_URL || 'https://dev-api.va.gov'

function createClient() {
  Issuer.defaultHttpOptions = { timeout: 5000 };
  return Issuer.discover(OAUTH_URL + '/.well-known/openid-configuration').then(issuer => {
    return new issuer.Client({
      client_id: process.env.VETS_API_CLIENT_ID,
      client_secret: process.env.VETS_API_CLIENT_SECRET,
      redirect_uris: [
        callbackUrl,
      ],
    });
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

function requireLogin(req, res, next) {
  if (req.session.user) {
    return next();
  } else {
    res.redirect('/auth');
  }
}

function startApp(client) {
  const app = express();
  app.set('view engine', 'hbs');
  app.set('view options', { layout: 'layout' });
  app.engine('handlebars', hbs.__express);
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(session({ secret: secret, saveUninitialized: true, resave: true, cookie: { maxAge: 60 * 60000 }}));

  app.get('/', (req, res) => {
    res.render('index', { user: req.session.user, activeIndex: true, header: "Welcome" });
  });
  app.get('/patient', requireLogin, async (req, res) => {
    const options = {
      url: API_URL + `/services/argonaut/v0/Patient/${req.session.user.patient}`,
      headers: { 'Authorization': 'Bearer ' + req.session.user['access_token'] }
    };
    try {
    const response = await request(options);
    res.render('patient', { patient: response, activePatient: true, user: req.session.user, header: 'Patient Information' });
    } catch (error) {
      res.render('error', { error: error, user: req.session.user, header: "Error" });
    }
  });
  [
    {
      path: '/conditions',
      endpoint: '/Condition?patient=',
      header: 'My Conditions',
      active: 'Conditions',
    },
    {
      path: '/allergy_intolerances',
      endpoint: '/AllergyIntolerance?patient=',
      header: 'My Allergy Intolerance',
      active: 'Allergies',
    },
    {
      path: '/medication_orders',
      endpoint: '/MedicationOrder?patient=',
      header: 'My Medication Orders',
      active: 'MedOrders',
    },
    {
      path: '/medication_statements',
      endpoint: '/MedicationStatement?patient=',
      header: 'My Medication Statements',
      active: 'MedStatements',
    },
    {
      path: '/observations',
      endpoint: '/Observation?patient=',
      header: 'My Observations',
      active: 'Observations',
    },
    {
      path: '/immunizations',
      endpoint: '/Immunization?patient=',
      header: 'My Immunizations',
      active: 'Immunizations',
    },
  ].forEach(({path, endpoint, header, active}) => {
    app.get(path, requireLogin, async (req, res, done) => {
      const options = {
        url: API_URL + `/services/argonaut/v0${endpoint}${req.session.user.patient}`,
        headers: { 'Authorization': 'Bearer ' + req.session.user['access_token'] }
      };
      try {
      const response = await request(options);
      const locals = { patient: response, user: req.session.user, header };
      locals[`active${active}`] = true;
        res.render('patient', locals);
      } catch (error) {
        res.render('error', { error: error, user: req.session.user, header: "Error" });
      }
    });
  });
  app.get('/auth', passport.authenticate('oidc'),
          function(req, res) {
            req.session.user = Object.assign(req.session.user, req.user);
          });
  app.get('/auth/cb', passport.authenticate('oidc'),
          function(req, res) {
            req.session.user = Object.assign(req.user);
            res.redirect('/');
          }
         );
  app.get('/auth/refresh', (req, res, done) => {
    client.refresh(req.session.user['refresh_token']).then(tokenset => {
      req.session.user = Object.assign(req.session.user, tokenset)
      res.send("Refreshed");
      done();
    });
  });
  app.get('/auth/introspect', (req, res, done) => {
    client.introspect(req.session.user['access_token']).then(tokendata => {
      res.json(tokendata);
      done();
    });
  });
  app.get('/logout', (req, res, done) => {
    req.session.destroy();
    res.redirect('/');
    done();
  });
  app.listen(port, () => console.log(`Example app listening on port ${port}!`));
}

const port = process.env.PORT || 8080;
const callbackUrl = process.env.CALLBACK_URL || 'http://localhost:' + port + '/auth/cb';
createClient().then(configurePassport).then(startApp);
//var client = configurePassport(createClient())
//startApp(client);

