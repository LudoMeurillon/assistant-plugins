var Client = require('castv2-client').Client;
var DefaultMediaReceiver = require('castv2-client').DefaultMediaReceiver;
var GoogleTTS = require('google-tts-api');
var mdns = require('mdns');


var AssistantNotifier = function(configuration) {
    this.googleHomes = [];
    if(configuration.host){
        this.googleHomes.push({
            name: "default",
            host: configuration.host
        });
    }
}

AssistantNotifier.prototype.init = function(plugins) {
  this.plugins = plugins;
  var self = this;

  return new Promise(function(resolve, reject){
      if(self.googleHomes.length > 0){
        resolve(self);
      } else {
          console.log("[assistant-notifier] auto-détection des google home du réseau");
          var mDNSBrowser = mdns.createBrowser(mdns.tcp('googlecast'));
          mDNSBrowser.on('serviceUp', function (service) {
              if(service.name.match("^Google\-Home.*")){
                  console.log('[assistant-notifier] Google Home trouvé "%s" à %s:%d', service.name, service.addresses[0], service.port);
                  self.googleHomes.push({
                      name: service.name,
                      host: service.addresses[0]
                  });
              } else {
                  console.log('[assistant-notifier] Equipement ignoré "%s" à %s:%d', service.name, service.addresses[0], service.port);
              }
          });

          console.log('[assistant-notifier] début du scan mDNS');
          mDNSBrowser.start();

          setTimeout(function () {
              console.log('[assistant-notifier] fin du scan mDNS');
              mDNSBrowser.stop();
              resolve(self);
          }, 5000);
      }
  });

  //return Promise.resolve(this);
};

const playMediaOnGoogleHomes = function(googleHomes, mediaurl){
    const connectPromises = googleHomes.map(function(googleHome){
        const client = new Client();
        const connectPromise = new Promise(function(resolve){
            client.connect(googleHome.host, function(){
                resolve({
                    client: client,
                    googleHome: googleHome
                });
            });
        });
        return connectPromise;
    });

    return Promise.all(connectPromises).then(function(clients){
        const launchPromises = clients.map(function(action){
            const launchPromise = new Promise(function(resolve){
                action.client.launch(DefaultMediaReceiver, function(err, player) {
                    const media = {
                        contentId: mediaurl,
                        contentType: 'audio/mp3',
                        streamType: 'BUFFERED'
                    };
                    console.log("reading on %j", action.googleHome);
                    player.load(media, {
                        autoplay: true
                    }, function(err, status) {
                        player.on('status', function(status) {
                            if (status.playerState == "IDLE") {
                                player.stop();
                                action.client.close();
                                resolve(action);
                            }
                        });
                    });
                });
            });
            return launchPromise;
        });
        return Promise.all(launchPromises).then(function(results){
            console.log("All message read %j", results);
            return results;
        })
    });
};

/**
 * Fonction appelée par le système central
 *
 * @param {String} text Le texte à lire (par exemple: "bonjour et bienvenue")
 */
AssistantNotifier.prototype.action = function(text) {
  var _this=this;

  return new Promise(function(resolveAction, reject) {
    // on génère le texte
    GoogleTTS(text, "fr-FR", 1).then(function(url) {
        playMediaOnGoogleHomes(_this.googleHomes, url).then(resolveAction, reject);
    });
  });
};

/**
 * Initialisation du plugin
 *
 * @param  {Object} plugins Un objet qui contient tous les plugins chargés
 * @return {Promise} resolve(this)
 */
exports.init=function(plugins) {
  var configuration = require('./configuration');
  var an = new AssistantNotifier(configuration);
  return an.init(plugins)
  .then(function(resource) {
    console.log("[assistant-notifier] Plugin chargé et prêt.");
    console.log("[assistant-notifier] Google Home trouvés : %j", an.googleHomes);
    return resource;
  })
}

