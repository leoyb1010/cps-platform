import { hash } from "../../src/lib/contentEngine.js";
import { buildSeriesEpisodePack, normalizeSeriesProfile, summarizeSeriesEpisode } from "../../src/lib/seriesEngine.js";
import {
  getSeriesProfile,
  listSeriesProfiles,
  putAutopilotTopic,
  putSeriesEpisode,
  putSeriesProfile,
  updateSeriesEpisode,
  updateSeriesProfile
} from "./store.js";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix, seed) {
  return `${prefix}-${hash(`${seed}:${Date.now()}`).toString(16)}-${Date.now()}`;
}

function publicProfile(profile) {
  return {
    ...profile,
    episodes: [...(profile.episodes || [])].sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
  };
}

export function getSeriesSnapshot() {
  return {
    ok: true,
    profiles: listSeriesProfiles().map(publicProfile)
  };
}

export async function createSeries(input) {
  const normalized = normalizeSeriesProfile(input);
  if (!normalized.title) throw new Error("series title is required");
  const now = nowIso();
  const profile = {
    id: makeId("series", normalized.title),
    ...normalized,
    episodes: [],
    created_at: now,
    updated_at: now
  };
  await putSeriesProfile(profile);
  return { ok: true, profile: publicProfile(profile), snapshot: getSeriesSnapshot() };
}

export async function saveSeries(id, patch) {
  const existing = getSeriesProfile(id);
  if (!existing) throw new Error("series not found");
  const normalized = normalizeSeriesProfile(patch, existing);
  const updated = await updateSeriesProfile(id, normalized);
  return { ok: true, profile: publicProfile(updated), snapshot: getSeriesSnapshot() };
}

function nextTopic(profile, input) {
  if (input.topic) return input.topic;
  const used = new Set((profile.episodes || []).map((episode) => episode.title));
  const queued = (profile.seedTopics || []).find((topic) => !used.has(topic));
  if (queued) return queued;
  return `${profile.title}：第 ${(profile.episodes || []).length + 1} 期`;
}

export async function addSeriesEpisode(seriesId, input) {
  const profile = getSeriesProfile(seriesId);
  if (!profile) throw new Error("series not found");
  const topic = nextTopic(profile, input);
  const pack = buildSeriesEpisodePack({
    series: profile,
    topic,
    notes: input.notes || "",
    generation: Date.now()
  });
  const summary = summarizeSeriesEpisode({ series: profile, pack, topic });
  const now = nowIso();
  const episode = {
    id: makeId("episode", `${seriesId}:${topic}`),
    seriesId,
    index: pack.series.episodeNo,
    title: summary.title,
    core: summary.core,
    status: input.status || "planned",
    notes: input.notes || "",
    recap: summary.recap,
    bridge: summary.bridge,
    nextHook: summary.nextHook,
    contentKind: "series",
    visualStyle: summary.visualStyle,
    platform: profile.platform,
    direction: profile.direction,
    tone: profile.tone,
    packPreview: pack,
    autopilotTopicId: null,
    created_at: now,
    updated_at: now
  };
  await putSeriesEpisode(seriesId, episode);
  return { ok: true, episode, pack, profile: publicProfile(getSeriesProfile(seriesId)), snapshot: getSeriesSnapshot() };
}

export async function queueSeriesEpisode(seriesId, episodeId, input = {}) {
  const profile = getSeriesProfile(seriesId);
  if (!profile) throw new Error("series not found");
  const episode = (profile.episodes || []).find((item) => item.id === episodeId);
  if (!episode) throw new Error("series episode not found");
  const now = nowIso();
  const topic = {
    id: makeId("topic", `${seriesId}:${episodeId}`),
    title: episode.title,
    source: "manual",
    status: input.status || "queued",
    priority: input.priority || "high",
    direction: episode.direction || profile.direction,
    tone: episode.tone || profile.tone,
    visualStyle: episode.visualStyle || profile.visualStyle,
    contentKind: "series",
    seriesId,
    seriesTitle: profile.title,
    seriesEpisodeId: episode.id,
    seriesEpisodeIndex: episode.index,
    notes: [
      `系列：${profile.title}`,
      `期数：第${episode.index}期`,
      `统一视觉风格：${episode.visualStyle || profile.visualStyle}`,
      episode.bridge ? `前情承接：${episode.bridge}` : "",
      episode.recap ? `本期核心：${episode.recap}` : "",
      episode.nextHook ? `下一期钩子：${episode.nextHook}` : "",
      episode.notes ? `备注：${episode.notes}` : ""
    ].filter(Boolean).join("\n").slice(0, 600),
    created_at: now,
    updated_at: now
  };
  await putAutopilotTopic(topic);
  const updatedEpisode = await updateSeriesEpisode(seriesId, episodeId, {
    status: "queued",
    autopilotTopicId: topic.id,
    queued_at: now
  });
  return { ok: true, topic, episode: updatedEpisode, snapshot: getSeriesSnapshot() };
}
