const {Client, Util} = require("discord.js");
const {GOOGLE_API_KEY, token, PREFIX} = require("./config.json");
const YouTube = require("simple-youtube-api");
const ytdl = require("ytdl-core");
	
const client = new Client({ disableEveryone: true });

const youtube = new YouTube(GOOGLE_API_KEY);

const queue = new Map();

client.on('warn', console.warn);

client.on('error', console.error);

client.on('ready', () => console.log('Hora do show porra!'));

client.on('disconnect', () => console.log('Disconnecting'));

client.on('reconnecting', () => console.log('reconnecting'));

client.on('message', async msg => { 
	if (msg.author.bot) return undefined;
	if (!msg.content.startsWith(PREFIX)) return undefined;

	const args = msg.content.split(' ');
	const searchString = args.slice(1).join(' ');
	const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
	const serverQueue = queue.get(msg.guild.id);

	let command = msg.content.toLowerCase().split(' ')[0];
	command = command.slice(PREFIX.length)


	if (command === 'play') {
		const voiceChannel = msg.member.voiceChannel;
		if (!voiceChannel) return msg.channel.send('Entra no canal burro!');
		const permissions = voiceChannel.permissionsFor(msg.client.user);
		if (!permissions.has('CONNECT')) {
			return msg.channel.send('Preciso de permissão para entrar!');
		}
		if (!permissions.has('SPEAK')) {
			return msg.channel.send('Preciso de permissão para tocar neste canal!');
		}

		if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
			const playlist = await youtube.getPlaylist(url);
			const videos = await playlist.getVideos();
			for (const video of Object.values(videos)) {
				const video2 = await youtube.getVideoByID(video.id);
				await handleVideo(video2, msg, voiceChannel, true);  
			}
			return handleVideo(video, msg, voiceChannel);
		
		} else {
			try {
				var video = await youtube.getVideo(url);
			} catch (error) {
				try {
					var videos = await youtube.searchVideos(searchString,5);
					let index = 0;
					msg.channel.send(`
__**Selecione uma música:**__
${videos.map(video2 => `**${++index} -** ${video2.title}`).join('\n')}
					`);

					try {
						var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11, {
							maxMatches: 1,
							time: 10000,
							errors: ['time']
						});
					} catch (err) {
						console.error(err);
						return msg.channel.send('  ');
					}
					const videoIndex = parseInt(response.first().content);
					var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
				} catch (err) {
					console.error(err);
					return msg.channel.send('🆘 Pesquisa sem resultado.');
				}
			}
			return handleVideo(video, msg, voiceChannel);
		}
	} else if(command === "help") {
		if (!msg.member.voiceChannel) return msg.channel.send('Comandos: show, fila, play, pause, resume, stop, skip e dev!');
		if (!serverQueue) return msg.channel.send('Comandos: show, fila, play, pause, resume, stop, skip e dev!');
		return msg.channel.send('Comandos: show, fila, play, pause, resume, stop, skip e dev!');
	} else if(command === "dev") {
		if (!msg.member.voiceChannel) return msg.channel.send('Meu desenvolvedor é o Líder Revolucionário Slide Boy!');
		if (!serverQueue) return msg.channel.send('Meu desenvolvedor é o Líder Revolucionário Slide Boy!');
		return msg.channel.send('Meu desenvolvedor é o Líder Revolucionário Slide Boy!');
	} else if (command === 'skip') {
		if (!msg.member.voiceChannel) return msg.channel.send('Você não está em um canal de voz!');
		if (!serverQueue) return msg.channel.send('Não há música tocando.');
		serverQueue.connection.dispatcher.end('Skipped!');
		return undefined;
	} else if (command === 'stop') {
		if (!msg.member.voiceChannel) return msg.channel.send('Você não está em um canal de voz!');
		if (!serverQueue) return msg.channel.send('Não há música tocando.');
		serverQueue.songs = [];
		serverQueue.connection.dispatcher.end('Pausado!');
		return undefined;
	 //else if (command === 'volume') {
		//if (!msg.member.voiceChannel) return msg.channel.send('Você não está em um canal!');
		//if (!serverQueue) return msg.channel.send('Nada tocando.');
		//if (!args[1]) return msg.channel.send(`O volume atual é: **${serverQueue.volume}**`);
		//serverQueue.volume = args[1];
		//serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
		//return msg.channel.send(`Volume definido para: **${args[1]}**`);
	} else if (command === 'show') {
		if (!serverQueue) return msg.channel.send('Nada Tocando.');
		return msg.channel.send(`🎶 Tocando agora: **${serverQueue.songs[0].title}**`);
	} else if (command === 'fila') {
		if (!serverQueue) return msg.channel.send('Nada tocando.');
		return msg.channel.send(`
__**Música na fila:**__
${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}
**Lets go:** ${serverQueue.songs[0].title}
		`);
	} else if (command === 'pause') {
		if (serverQueue && serverQueue.playing) {
			serverQueue.playing = false;
			serverQueue.connection.dispatcher.pause();
			return msg.channel.send('⏸ pausado!');
		}
		return msg.channel.send('Nada tocando.');
	} else if (command === 'resume') {
		if (serverQueue && !serverQueue.playing) {
			serverQueue.playing = true;
			serverQueue.connection.dispatcher.resume();
			return msg.channel.send('▶ Voltando ao show!');
		}
		return msg.channel.send('Nada tocando.');
	}

	return undefined;
});

async function handleVideo(video, msg, voiceChannel, playlist = false) {
	const serverQueue = queue.get(msg.guild.id);
	console.log(video);
	const song = {
		id: video.id,
		title: Util.escapeMarkdown(video.title),
		url: `https://www.youtube.com/watch?v=${video.id}`
	};
	if (!serverQueue) {
		const queueConstruct = {
			textChannel: msg.channel,
			voiceChannel: voiceChannel,
			connection: null,
			songs: [],
			volume: 5,
			playing: true
		};
		queue.set(msg.guild.id, queueConstruct);

		queueConstruct.songs.push(song);

		try {
			var connection = await voiceChannel.join();
			queueConstruct.connection = connection;
			play(msg.guild, queueConstruct.songs[0]);
		} catch (error) {
			console.error(`Não consegui entrar no canal: ${error}`);
			queue.delete(msg.guild.id);
			return msg.channel.send(`Não consegui entrar no canal: ${error}`);
		}
	} else {
		serverQueue.songs.push(song);
		console.log(serverQueue.songs);
		if (playlist) return undefined;
		else return msg.channel.send(`✅ **${song.title}** adicionado à fila!`);
	}
	return undefined;
}

function play(guild, song) {
	const serverQueue = queue.get(guild.id);

	if (!song) {
		serverQueue.voiceChannel.leave();
		queue.delete(guild.id);
		return;
	}
	console.log(serverQueue.songs);

	const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
		.on('end', reason => {
			if (reason === 'Fluxo lento.') console.log('Música Terminada.');
			else console.log(reason);
			serverQueue.songs.shift();
			play(guild, serverQueue.songs[0]);
		})
		.on('error', error => console.error(error));
	dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

	serverQueue.textChannel.send(`🎶 Começando o Show: **${song.title}**`);
}

client.login(token);
