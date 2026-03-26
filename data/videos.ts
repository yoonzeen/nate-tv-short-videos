export type VideoItem = {
  id: string;
  title: string;
  channel: string;
  description: string;
  src: string;
};

export const videos: VideoItem[] = [
  {
    id: "big-buck-bunny",
    title: "오늘의 추천 쇼츠 01",
    channel: "NateTV",
    description: "샘플 영상입니다. 실제 네이트TV 영상 주소로 교체해서 사용하세요.",
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  },
  {
    id: "elephants-dream",
    title: "오늘의 추천 쇼츠 02",
    channel: "NateTV",
    description: "15초까지만 자동 재생되고 다음 영상으로 넘어갑니다.",
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  },
  {
    id: "for-bigger-joyrides",
    title: "오늘의 추천 쇼츠 03",
    channel: "NateTV",
    description: "영상 데이터는 data/videos.ts에서 자유롭게 추가할 수 있습니다.",
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  },
];
