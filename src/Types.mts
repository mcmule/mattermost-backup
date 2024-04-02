export interface IUser {
    id: string;
    username: string; // 'inesrengifo',
    email: string;
    nickname: '',
    first_name: string;
    last_name: string;
    position: string;
}
export interface IBasicChannel {
    channel_id: string;
    user_id: string;
    roles: string;
    msg_count: number;
}

export interface IChannel {
    id: string;
    delete_at: number;
    team_id: string;
    type: 'P',
    display_name: string;
    name: string;
    header: string;
    total_msg_count: number;
    total_msg_count_root: number;
}

export type PostId = string;

export interface IPost {
    id: string;
    root_id: string;
    create_at: number;
    update_at: number;
    edit_at: number;
    delete_at: number;
    is_pinned: boolean;
    user_id: string;
    channel_id: string;
    message: string;
    file_ids: string[];
    reply_count: number;
    metadata: { files: unknown[] }
}

export interface IPosts {
    order: PostId[];
    posts: [PostId: IPost];
}

export interface IDiscussion {
    post: IPost;
    replies: IPost[];
}

export interface OMessage{
    userId: string;
    unixTS: number;
    message: string;
    pinned: boolean;
    replies: OMessage[];
}
export interface OUser {
    id: string;
    name: string;
    fullname: string;
    email: string;
}
export interface OChannel {
    id: string;
    name: string
    dispName: string;
    header: string;
}
export interface OFile {
    channel: OChannel;
    users: OUser[];
    discussions: OMessage[];
}
