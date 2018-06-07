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
  const id = episode.anime_id;
  const title = animes[id]
  return Object.assign(episode, {show: title});
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

        const showsToday = episodes.filter((episode) => filterEpisode(currentDate, episode))
          .map((episode) => mergeAnimeMetaWithEpisode(idToTitle, episode))
          .map((episode) => episode.show);
        let responseMessage = 'Current Season Anime Airing Today:\n';
        showsToday.forEach((show) => {
          responseMessage += `- ${show}\n`;
        });
        channel.send(responseMessage);
      } else {
        log.error(response.data);
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
  }

  const oneDayInMilliseconds = 86400000;
  // development 10 second interval.
  // const oneDayInMilliseconds = 10000;
  const dailyUpdateInterval = client.setInterval(fetchTodaysAnime,
                                                 oneDayInMilliseconds,
                                                 channel);
  log.info(`daily interval set for ${channel.name}`);
  message.send(`daily interval has been set for ${guild.name}#${channel.name}`);
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
