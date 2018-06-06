# AnimeFeedBot
A simple discord bot to notify your channels of upcoming anime
showings.

## Purpose
I wrote this bot to familiarize myself with the discord developer tools.

## External Dependencies
- [monthly.moe](https://www.monthly.moe/)

## Setup
1. Clone the repository
```
git clone https://github.com/lamdaV/AnimeFeedBot.git
```

2. Create a logs directory
```
cd AnimeFeedBot
mkdir logs
touch logs/bot.log
```

3. Install dependencies
```
npm install
// or
yarn install
```

4. Create a `.env` file with your token
```
echo "DISCORD_TOKEN=YOUR_DISCORD_TOKEN" > .env
```

5. Start the bot.
```
npm run start
// or
yarn start
```

## Development
Run through the [Setup](#setup) once. Run
```
npm run dev
// or
yarn dev
```
