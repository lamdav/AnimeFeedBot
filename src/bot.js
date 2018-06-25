require('dotenv').config();
const axios = require('axios');
const Discord = require('discord.js');
const bunyan = require('bunyan');
const path = require('path');

const client = new Discord.Client();
const token = process.env.DISCORD_TOKEN;

const log = bunyan.createLogger({
  name: 'AnimeFeedBotLog',
  streams: [
    {
        level: 'info',
        stream: process.stdout
    },
    {
      type: 'rotating-file',
      path: path.join(path.dirname(__dirname), 'logs', 'bot.log'),
      period: '1d',
      count: 3
    }
  ]
});

/**
 *  Handle event when bot is functional.
 */
client.on('ready', () => {
  log.info('Sandbox Bot is Ready!');
});

/**
 *  Return true if the episode is airing on the currentDate.
 */
const filterEpisode = (currentDate, episode) => {
  const airDate = new Date(episode.datetime);
  return compareDates(currentDate, airDate);
};

/**
 *  Return true if the dates year, month, and day are the same.
 */
const compareDates = (date1, date2) => {
  return date1.getUTCFullYear() === date2.getUTCFullYear()
    && date1.getUTCMonth() === date2.getUTCMonth()
    && date1.getUTCDate() === date2.getUTCDate();
};

/**
 *  Merge the episode with the show's title into one object.
 */
const mergeAnimeMetaWithEpisode = (animes, episode) => {
  const data = animes[episode.anime_id];
  return Object.assign(episode, {title: title});
};

/**
 *  Fetch Anime for the current date.
 */
const fetchTodaysAnime = (channel) => {
  const currentDate = new Date();
  // zero -> one based indexing
  let utcMonth = currentDate.getUTCMonth() + 1;
  if (utcMonth < 10) {
    utcMonth = `0${utcMonth}`;
  }
  const utcYear = currentDate.getUTCFullYear();

  const params = {
    params: {
      date: `${utcMonth}-${utcYear}`
    }
  }
  axios.get('https://www.monthly.moe/api/v1/calendar', params)
    .then((response) => {
      log.info(`received response with status ${response.status} from monthly.moe`);
      if (response.status === 200) {
        const episodes = response.data.episodes;
        const animes = response.data.animes;

        const idToTitle = {};
        animes.forEach((anime) => {
          idToTitle[anime.id] = anime.main_title;
        });

        const episodeReducer = (episodeMap, episode) => {
          const animeId = episode.anime_id;
          const episodeData = episodeMap[animeId];
          if (episodeData) {
            const updatedDatum = Object.assign(episodeData,
               {episodes: episodeData.episodes.concat([episode])});
            return Object.assign(episodeMap, updatedDatum);
          } else {
            const datum = {};
            datum[animeId] = {title: idToTitle[animeId], episodes: [episode]};
            return Object.assign(episodeMap, datum);
          }
        };
        const idToMeta = episodes.filter((episode) => filterEpisode(currentDate, episode))
          .reduce(episodeReducer, {});
        log.info(idToMeta);

        const sortByTitle = (meta1, meta2) => {
          if (meta1.title < meta2.title) {
            return -1
          } else if (meta1.title === meta2.title) {
            return 0;
          } else {
            return 1;
          }
        };
        const constructEpisodeMessage = (message, episode) => {
          return message.concat(`- Ep ${episode.number} @ ${new Date(episode.datetime).toTimeString()}\n`);
        };
        const constructDiscordEmbeddableFields = (meta) => {
          return {
            name: meta.title,
            value: meta.episodes.reduce(constructEpisodeMessage, '')
          };
        };
        const embeddedFields = Object.values(idToMeta)
          .sort(sortByTitle)
          .map(constructDiscordEmbeddableFields);

        const randomColor = Math.floor(Math.random() * 1000000);
        const embeddedMessage = {
          embed: {
            title: `Anime for ${currentDate.toDateString()}`,
            color: randomColor,
            fields: embeddedFields
          }
        };
        channel.send('', embeddedMessage)
          .catch((error) => log.error(error));
      } else {
        log.error(response.data);
        channel.send(`There was an issue fetching anime data: ${response.status} -- ${response.data}`);
      }
    })
    .catch((error) => { log.error(error) });
};

/**
 * Send the praise the sun emoji.
 */
const praiseTheSun = (channel) => {
  channel.send('\\\\[T]/ \\\\[T]/ \\\\[T]/');
};

const updateMap = {};
/**
 *  Update the given channel with listed showings.
 */
const setDailyUpdateInterval = (guild, channel) => {
  if (!guild) {
    channel.send('only server channels may have daily updates');
    return;
  }

  guildIntervalMap = updateMap[guild.id];
  if (guildIntervalMap) {
    channelInterval = guildIntervalMap[channel.id];
    if (channelInterval) {
      channel.send('update has already been set for this channel');
      return;
    }
  } else {
    guildIntervalMap = {};
  }

  const oneDayInMilliseconds = 86400000;
  // development 10 second interval.
  // const oneDayInMilliseconds = 10000;
  const dailyUpdateInterval = client.setInterval(fetchTodaysAnime,
                                                 oneDayInMilliseconds,
                                                 channel);

  channelIntervalMap = {};
  channelIntervalMap[channel.id] = dailyUpdateInterval;
  guildIntervalMap = Object.assign(guildIntervalMap, channelIntervalMap);
  updateMap[guild.id] = guildIntervalMap;

  log.info(`daily interval set for ${channel.name}`);
  channel.send(`daily interval has been set for ${guild.name}#${channel.name}`);
};

const help = (channel) => {
  channel.send(`
  Here are a list of commands you can execute:\n\n
  * '-> anime-today' to get the current anime showing today\n
  * '-> praise-the-sun' to get the praise the sun emoji\n
  * '-> update' to set the current channel to receive daily updates\n
  `);
}

/**
 *  Handle all message events.
 */
client.on('message', (message) => {
  log.info(`message received: ${message.content}`);
  if (message.author === 'sandbox') {
    return;
  }

  switch (message.content) {
    case '-> anime-today':
      fetchTodaysAnime(message.channel);
      break;
    case '-> praise-the-sun':
      praiseTheSun(message.channel);
      break;
    case '-> update':
      setDailyUpdateInterval(message.guild, message.channel);
      break;
    case '-> help':
      help(message.channel);
    default:
      return;
  }
});

client.login(token);
