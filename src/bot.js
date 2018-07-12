require('dotenv').config();
const axios = require('axios');
const Discord = require('discord.js');
const bunyan = require('bunyan');
const path = require('path');
const moment = require('moment-timezone');
moment.tz.setDefault('America/Los_Angeles');

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
 *  Get a random large integer for as color.
 */
const generateRandomColor = () => {
  return Math.floor(Math.random() * 1000000);
}

/**
 *  Fetch Anime for the current date.
 */
const fetchTodaysAnime = (channel, args) => {
  const TIMEZONE_PREFIX = 'TZ=';
  const FORMAT_PREFIX = 'FMT=';

  let currentDate = moment();
  let momentFormat = 'YYYY/MM/DD';
  if (args && args.length >= 1) {
    for (let arg of args) {
      if (arg.startsWith(TIMEZONE_PREFIX)) {
        let timezone = arg.substring(TIMEZONE_PREFIX.length)
        if (!moment.tz.zone(timezone)) {
          channel.send(`Invalid timezone ${timezone}\nPlease provide the appropriate \`TZ\` found here: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones`);
          return;
        }
        currentDate = moment().tz(timezone);
      } else if (arg.startsWith(FORMAT_PREFIX)) {
        let formatString = arg.substring(FORMAT_PREFIX.length).toUpperCase();
        switch (formatString) {
          case 'DMY':
            momentFormat = 'DD/MM/YYYY';
            break;
          case 'MDY':
            momentFormat = 'MM/DD/YYYY';
            break;
          case 'YMD': // Fallthrough
          default:
            momentFormat = 'YYYY/MM/DD';
            break;
        }
      }
    }
  }

  // zero -> one based indexing
  let month = currentDate.month() + 1;
  if (month < 10) {
    month = `0${month}`;
  }
  const year = currentDate.year();

  const params = {
    params: {
      date: `${month}-${year}`
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

        const convertToMomentDatetime = (episode) => {
          const convertedDatetime = moment(episode.datetime);
          return Object.assign(episode, {datetime: convertedDatetime});
        };
        const filterEpisode = (currentDate, episode) => {
          return currentDate.isSame(episode.datetime, 'day');
        };
        const episodeReducer = (episodeMap, episode) => {
          const animeId = episode.anime_id;
          const episodeData = episodeMap[animeId];
          if (episodeData) {
            const updatedDatum = Object.assign(episodeData,
               {episodes: episodeData.episodes.concat([episode])});
            const updatedMapping = {};
            updatedMapping[animeId] = updatedDatum;
            return Object.assign(episodeMap, updatedMapping);
          } else {
            const datum = {};
            datum[animeId] = {title: idToTitle[animeId], episodes: [episode]};
            return Object.assign(episodeMap, datum);
          }
        };
        const idToMeta = episodes
          .map(convertToMomentDatetime)
          .filter((episode) => filterEpisode(currentDate, episode))
          .reduce(episodeReducer, {});

        /**
         *  Check to see if every episode under meta1 (title, episodes[])
         *  is before every episode under meta2. If so, meta1, comes before
         *  meta2. If there is a mix, it is resolved by their lexigraphical
         *  ordering of their title.
         *
         *  Shows with episodes listed with time 0:00,
         *  will be mutated with a new time 23:59. This is done to pull these
         *  shows towards the bottom of the listing in which their title will
         *  sort them.
         */
        const sortByAirtime = (meta1, meta2) => {
          let time1;
          let time2;
          for (let i = 0; i < meta1.episodes.length; i++) {
            time1 = meta1.episodes[i].datetime;
            if (time1.hour() === 0 && time1.minute() === 0) {
              time1.hour(23);
              time1.minute(59);
            }
            for (let k = 0; k < meta2.episodes.length; k++) {
              time2 = meta2.episodes[k].datetime;
              if (time2.hour() === 0 && time2.minute() === 0) {
                time2.hour(23);
                time2.minute(59);
              }
              if (time1.isAfter(time2, 'minute')) {
                if (i === 0) { // check the reverse.
                  return -sortByAirtime(meta2, meta1)
                } else if (meta1.title < meta2.title) { // mix-case.
                  return -1;
                } else if (meta1.title === meta2.title) {
                  return 0;
                } else {
                  return 1;
                }
              }
            }
          }
          return -1;
        };
        const constructEpisodeMessage = (message, episode) => {
          let showtime;
          if (episode.datetime.hour() === 23 && episode.datetime.minute() === 59) {
              showtime = '???';
          } else {
            showtime = episode.datetime
              .tz(currentDate.tz())
              .format('HH:mm');
          }
          return message.concat(`- Ep ${episode.number} @ ${showtime}\n`);
        };
        const constructDiscordEmbeddableFields = (meta) => {
          return {
            name: meta.title,
            value: meta.episodes.reduce(constructEpisodeMessage, '')
          };
        };
        const embeddedFields = Object.values(idToMeta)
          .map(convertToMomentDatetime)
          .sort(sortByAirtime)
          .map(constructDiscordEmbeddableFields);

        const embeddedMessage = {
          embed: {
            title: `Anime for ${currentDate.format(momentFormat)}`,
            color: generateRandomColor(),
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
const setDailyUpdateInterval = (guild, channel, args) => {
  const INTERVAL_INDEX = 0;

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

  if (args && args.length >= 1) {
    const delay = args[INTERVAL_INDEX];
    if (isNaN(delay)) {
      channel.send(`interval ${delay} is not a number`);
      return;
    }
    args = args.slice(1);

    const dailyUpdateInterval = client.setInterval(fetchTodaysAnime,
                                                   delay,
                                                   channel,
                                                   args);
    channelIntervalMap = {};
    channelIntervalMap[channel.id] = dailyUpdateInterval;
    guildIntervalMap = Object.assign(guildIntervalMap, channelIntervalMap);
    updateMap[guild.id] = guildIntervalMap;

    log.info(`daily interval set for ${channel.name}`);
    channel.send(`daily interval has been set for ${guild.name}#${channel.name}`);
  } else {
    channel.send(`missing 1 required argument: interval`);
  }
};

/**
 *  Respond with a help message with a list of commands available.
 */
const help = (channel) => {
  const embeddedMessage = {
    embed: {
      title: 'Commands',
      color: generateRandomColor(),
      description: 'Here are a list of commands available',
      fields: [
        {
          name: '`-> anime-today [TZ=timezone]`',
          value: `You may specify a timezone to adjust all showtimes. The timezones can be found here: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones. If none is provided, the default is America/Los_Angeles. Example: \`-> anime-today TZ=America/Los_Angeles\`.`
        },
        {
          name: '`-> praise-the-sun`',
          value: 'Responds with the praise the sun emoji.'
        },
        {
          name: '`-> update <interval> [TZ=timezone] [FMT=format]`',
          value: `Sets the current channel to receive daily updates. Interval is a required field in milliseconds (ms) used to specify the frequency of the updates. Timezone is the same optional parameter used in \`-> anime-today\`. Formats are of the forms DMY, MDY, or YMD where D is for day, M is for month, and Y is for year. The default format is YMD.`,
        }
      ]
    }
  };

  channel.send('', embeddedMessage);
}

/**
 *  Handle all message events.
 */
client.on('message', (message) => {
  log.info(`message received: ${message.content}`);
  if (message.author === 'sandbox') {
    return;
  }

  const content = message.content;
  if (content.startsWith('-> anime-today')) {
    const args = content.split(' ')
      .slice(2);
    fetchTodaysAnime(message.channel, args);
  } else if (content === '-> praise-the-sun') {
    praiseTheSun(message.channel);
  } else if (content.startsWith('-> update')) {
    const args = content.split(' ')
      .slice(2);
    setDailyUpdateInterval(message.guild, message.channel, args);
  } else if (content === '-> help') {
    help(message.channel);
  }
});

client.login(token);
