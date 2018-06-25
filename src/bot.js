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
 *  Return true if the episode is airing on the currentDate.
 */
const filterEpisode = (currentDate, episode) => {
  const airDate = moment(episode.datetime).tz(currentDate.tz());
  return currentDate.isSame(airDate, 'day');
};

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
  const TIMEZONE_INDEX = 0;

  let currentDate;
  if (args && args.length >= 1) {
    if (!moment.tz.zone(args[TIMEZONE_INDEX])) {
      channel.send(`Invalid timezone ${args[TIMEZONE_INDEX]}\n
        Please provide the appropriate \`TZ\` found
        here: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones`);
      return;
    }
    currentDate = moment().tz(args[TIMEZONE_INDEX]);
  } else {
    currentDate = moment();
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
          const showtime = moment(episode.datetime)
            .tz(currentDate.tz())
            .format('HH:mm');
          return message.concat(`- Ep ${episode.number} @ ${showtime}\n`);
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

        const embeddedMessage = {
          embed: {
            title: `Anime for ${currentDate.format('MMMM Do YYYY (zz)')}`,
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
  // const oneDayInMilliseconds = 86400000;
  // development 10 second interval.
  // const oneDayInMilliseconds = 10000;
  //
  //
  // channelIntervalMap = {};
  // channelIntervalMap[channel.id] = dailyUpdateInterval;
  // guildIntervalMap = Object.assign(guildIntervalMap, channelIntervalMap);
  // updateMap[guild.id] = guildIntervalMap;
  //
  // log.info(`daily interval set for ${channel.name}`);
  // channel.send(`daily interval has been set for ${guild.name}#${channel.name}`);
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
          name: '`-> anime-today [TZ]`',
          value: `You may specify a timezone to adjust all showtimes. The timezones
          can be found here:
          https://en.wikipedia.org/wiki/List_of_tz_database_time_zones.
          If none is provided, the default is America/Los_Angeles.
          Example: \`-> anime-today America/Los_Angeles\`.\n`
        },
        {
          name: '`-> praise-the-sun`',
          value: 'Responds with the praise the sun emoji'
        },
        {
          name: '`-> update`',
          value: 'Sets the current channel to receive daily updates.'
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
