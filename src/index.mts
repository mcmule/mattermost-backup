import type { AxiosInstance, AxiosResponse } from 'axios';
import axios from 'axios';
import { configDotenv } from 'dotenv';
import _ from 'lodash';
import moment from 'moment';
import type { IBasicChannel, IChannel, IDiscussion, IPost, IPosts, IUser, OFile, OMessage, OUser, PostId } from './Types.mjs';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

configDotenv();

export function sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve): unknown => { return setTimeout(resolve, ms); });
}

const mattermost: AxiosInstance = axios.create({
    baseURL:'https://chat.lylo.tv',
    headers:{ 'content-type': 'application/json' },
});

function userName(user: IUser): string {
    return user.first_name + ' ' + user.last_name;
}

function datetime(tsInMS: number): string {
    return moment.unix(tsInMS / 1000).format('YYYY-MM-DD HH:mm:ss');
}
function time(tsInMS: number): string {
    return moment.unix(tsInMS / 1000).format('HH:mm:ss');
}

function simplifyString(v: string): string {
    return v.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9 ._-]/gim, '')
        .replace(/ /gmi, '_');
}

async function main(): Promise<void> {
    const login: string = process.env.USER_EMAIL as string;
    const pwd: string = process.env.USER_PWD as string;
    const loginResponse: AxiosResponse<{id: string}> = await mattermost.post(
        '/api/v4/users/login',
        {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            login_id: login,
            password: pwd
        }
    );

    const token: string | undefined = loginResponse.headers.token;
    const userId: string = loginResponse.data.id;

    // eslint-disable-next-line require-atomic-updates
    mattermost.defaults.headers.common['Authorization'] = 'Bearer ' + token;


    const channelsResponse: AxiosResponse<IBasicChannel[]> = await mattermost.get(
        `/api/v4/users/${userId}/channel_members`
    );
    const channels: IBasicChannel[] = channelsResponse.data;
    console.log(`# Found ${channels.length} channels, with a total of ${_(channels).map((c) => { return c.msg_count; }).sum()} messages`);

    const userForId = new Map<string, IUser>();// users.map((u) => { return [u.id, u]; }));

    let channelIndex: number = 1;
    for (const currentChannel of channels) {
        const channelResponse: AxiosResponse<IChannel> = await mattermost.get(
            `/api/v4/channels/${currentChannel.channel_id}`
        );
        const channel: IChannel = channelResponse.data;
        console.log(`# Processing channel (${channelIndex++}/${channels.length})`, channel.display_name, channel.name);

        const thePosts: IPost[] = [];
        let latestResponse: IPosts;
        let currentPage: number = 0;
        // Fetch all posts using pagination
        do {
            const postsResponse: AxiosResponse<IPosts> = await mattermost.get(
                `/api/v4/channels/${channel.id}/posts?page=${currentPage}&per_page=200`
            );
            latestResponse = postsResponse.data;
            thePosts.push(...Object.values(latestResponse.posts));

            currentPage++;
        } while (latestResponse.order.length > 0);

        console.log(`\tgot ${thePosts.length} messages`);

        const channelUserIds: string[] = _(thePosts).map((p) => { return p.user_id; }).uniq().value();
        const missingUserIds = _.difference(channelUserIds, Array.from(userForId.keys()));

        if (missingUserIds.length > 0) {
            const usersResponse: AxiosResponse<IUser[]> = await mattermost.post(
                '/api/v4/users/ids',
                missingUserIds
            );
            const missingUsers: IUser[] = usersResponse.data;
            missingUsers.forEach((user: IUser): void => {
                userForId.set(user.id, user);
            });
        }

        const allPosts: IPost [] = thePosts;
        allPosts.sort((left: IPost, right: IPost): number => { return left.create_at - right.create_at; });
        const discussions = new Map<PostId, IDiscussion>();

        /**
         * We build a simple tree of posts:
         * - roots are messages that are not part of a thread
         * - replies are messages linked to a root
         */
        const roots: IPost[] = allPosts.filter((post: IPost): boolean => { return post.root_id === ''; });
        const replies: IPost[] = allPosts.filter((post: IPost): boolean => { return post.root_id !== ''; });

        for (const root of roots) {
            discussions.set(root.id, { post:root, replies:[] });
        }

        for (const reply of replies) {
            const discussion: IDiscussion = discussions.get(reply.root_id)!;
            discussion.replies.push(reply);
        }

        let textOutput: string = '';
        for (const discussion of discussions.values()) {
            textOutput += `${datetime(discussion.post.create_at)} | ${userName(userForId.get(discussion.post.user_id)!)} | ${discussion.post.message}\n`;
            for (const reply of discussion.replies) {
                textOutput += `     ->    ${time(reply.create_at)} | ${userName(userForId.get(reply.user_id)!)} | ${reply.message}\n`;
            }
        }

        const output: OFile = {
            channel: {
                dispName:channel.display_name,
                header: channel.header,
                name:channel.name,
                id:channel.id,
            },
            users:channelUserIds.map((uId: string): OUser => {
                const user = userForId.get(uId)!;

                return {
                    id:user.id,
                    email: user.email,
                    fullname: user.first_name + ' ' + user.last_name,
                    name: user.username,
                };
            }),
            discussions: Array.from(discussions.values()).map((d: IDiscussion): OMessage => {
                return {
                    userId:d.post.id,
                    pinned:d.post.is_pinned,
                    unixTS:d.post.create_at / 1000,
                    message: d.post.message,
                    replies: d.replies.map((p: IPost): OMessage => {
                        return {
                            userId:p.id,
                            pinned:p.is_pinned,
                            unixTS:p.create_at / 1000,
                            message: p.message,
                            replies:[],
                        };
                    })
                };
            })
        };

        if (!existsSync('./out'))
            mkdirSync('out');

        const filename: string = `./out/mm-chan-${simplifyString(channel.display_name || channel.name)}.json`;
        writeFileSync(filename, JSON.stringify(output, null, 2));
        const textFilename: string = `./out/mm-chan-${simplifyString(channel.display_name || channel.name)}.txt`;
        writeFileSync(textFilename, textOutput);

        await sleep(5000);
    }
}

await main();
