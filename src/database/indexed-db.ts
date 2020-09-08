import Dexie from "dexie";

import {
  IProjectSummary,
  ProjectId,
  ITrackedTutorial,
  ITutorialTrackingUpdate,
} from "../model/projects";
import { IProjectContent } from "../model/project";
import { IAssetInProject, AssetId } from "../model/asset";

const _octetStringOfU8: Array<string> = (() => {
  const strings = [];
  for (let i = 0; i <= 0xff; ++i) strings.push(i.toString(16).padStart(2, "0"));
  return strings;
})();

const _hexOfBuffer = (data: ArrayBuffer): string => {
  const u8s = new Uint8Array(data);
  const octetStrings = new Array(u8s.length);
  for (let i = 0; i !== u8s.length; ++i)
    octetStrings[i] = _octetStringOfU8[u8s[i]];
  return octetStrings.join("");
};

const _idOfAssetData = async (data: ArrayBuffer): Promise<string> => {
  const hash = await window.crypto.subtle.digest({ name: "SHA-256" }, data);
  return _hexOfBuffer(hash);
};

// TODO: Is there a good way to avoid repeating this information here vs
// in the IProjectSummary definition?
interface ProjectSummaryRecord {
  id?: ProjectId; // Optional because auto-incremented
  name: string;
  summary?: string;
  trackedTutorial?: ITrackedTutorial;
}

interface ProjectCodeTextRecord {
  id?: ProjectId; // Optional because auto-incremented
  codeText: string;
}

interface ProjectAssetRecord {
  id?: number; // Optional because auto-incremented
  projectId: ProjectId;
  name: string;
  mimeType: string;
  assetId: AssetId;
}

interface AssetRecord {
  id: AssetId;
  data: ArrayBuffer;
}

export class DexieStorage extends Dexie {
  projectSummaries: Dexie.Table<ProjectSummaryRecord, number>;
  projectCodeTexts: Dexie.Table<ProjectCodeTextRecord, number>;
  projectAssets: Dexie.Table<ProjectAssetRecord, number>;
  assets: Dexie.Table<AssetRecord, AssetId>;

  constructor() {
    super("pytch");

    this.version(1).stores({
      projectSummaries: "++id", // name, summary, trackedTutorial
      projectCodeTexts: "id", // codeText
      projectAssets: "++id, projectId", // name, mimeType, assetId
      assets: "id", // data
    });

    this.projectSummaries = this.table("projectSummaries");
    this.projectCodeTexts = this.table("projectCodeTexts");
    this.projectAssets = this.table("projectAssets");
    this.assets = this.table("assets");
  }

  async createNewProject(
    name: string,
    summary?: string,
    trackedTutorial?: ITrackedTutorial,
    codeText?: string
  ): Promise<IProjectSummary> {
    const protoSummary = { name, summary, trackedTutorial };
    const id = await this.projectSummaries.add(protoSummary);
    await this.projectCodeTexts.add({
      id,
      codeText: codeText ?? `# Code for "${name}"`,
    });
    return { id, ...protoSummary };
  }

  async deleteProject(id: ProjectId): Promise<void> {
    const tables = [
      this.projectSummaries,
      this.projectCodeTexts,
      this.projectAssets,
    ];
    await this.transaction("rw", tables, async () => {
      await this.projectSummaries.delete(id);
      await this.projectCodeTexts.delete(id);
      await this.projectAssets.where("projectId").equals(id).delete();
    });
  }

  async updateTutorialChapter(update: ITutorialTrackingUpdate): Promise<void> {
    // TODO: Is there a good way to not repeat this checking logic
    // between here and the front end?
    let summary = await this.projectSummaries.get(update.projectId);
    if (summary == null) {
      throw Error(`could not find project-summary for ${update.projectId}`);
    }
    if (summary.trackedTutorial == null) {
      throw Error(`project ${update.projectId} is not tracking a tutorial`);
    }
    summary.trackedTutorial.chapterIndex = update.chapterIndex;
    await this.projectSummaries.put(summary);
  }

  async allProjectSummaries(): Promise<Array<IProjectSummary>> {
    const summaries = await this.projectSummaries.toArray();
    return summaries.map((sr) => {
      if (sr.id == null) {
        throw Error("got null ID in projectSummaries table");
      }
      return {
        id: sr.id,
        name: sr.name,
        summary: sr.summary,
      };
    });
  }

  async projectContent(id: ProjectId): Promise<IProjectContent> {
    const [summary, codeRecord, assetRecords] = await Promise.all([
      this.projectSummaries.get(id),
      this.projectCodeTexts.get(id),
      this.projectAssets.where("projectId").equals(id).toArray(),
    ]);
    if (summary == null) {
      throw Error(`could not find project-summary for ${id}`);
    }
    if (codeRecord == null) {
      throw Error(`could not find code for project "${id}"`);
    }
    if (assetRecords == null) {
      throw Error(`got null assetRecords for project id "${id}"`);
    }
    const content = {
      id,
      codeText: codeRecord.codeText,
      assets: assetRecords.map((r) => ({
        name: r.name,
        mimeType: r.mimeType,
        id: r.assetId,
      })),
      trackedTutorial: summary.trackedTutorial,
    };
    return content;
  }

  async _storeAsset(assetData: ArrayBuffer): Promise<string> {
    const id = await _idOfAssetData(assetData);
    await this.assets.put({ id, data: assetData });
    return id;
  }

  async addAssetToProject(
    projectId: ProjectId,
    name: string,
    mimeType: string,
    data: ArrayBuffer
  ): Promise<IAssetInProject> {
    const assetId = await this._storeAsset(data);
    await this.projectAssets.put({
      projectId,
      name,
      mimeType,
      assetId,
    });
    return { name, mimeType, id: assetId };
  }

  async addRemoteAssetToProject(
    projectId: ProjectId,
    url: string
  ): Promise<IAssetInProject> {
    const rawResp = await fetch(url);

    const mimeType = rawResp.headers.get("Content-Type");
    if (mimeType == null) {
      throw Error("did not get Content-Type header from remote asset fetch");
    }

    const data = await rawResp.arrayBuffer();

    const nameParts = url.split("/");
    const localName = nameParts[nameParts.length - 1];

    return this.addAssetToProject(projectId, localName, mimeType, data);
  }

  async updateCodeTextOfProject(projectId: ProjectId, codeText: string) {
    await this.projectCodeTexts.put({ id: projectId, codeText });
  }

  async assetData(assetId: AssetId): Promise<ArrayBuffer> {
    const assetRecord = await this.assets.get({ id: assetId });
    if (assetRecord == null) {
      throw Error(`could not find asset with id "${assetId}"`);
    }
    return assetRecord.data;
  }
}

const _db = new DexieStorage();

export const allProjectSummaries = _db.allProjectSummaries.bind(_db);
export const createNewProject = _db.createNewProject.bind(_db);
export const updateTutorialChapter = _db.updateTutorialChapter.bind(_db);
export const projectContent = _db.projectContent.bind(_db);
export const addAssetToProject = _db.addAssetToProject.bind(_db);
export const addRemoteAssetToProject = _db.addRemoteAssetToProject.bind(_db);
export const updateCodeTextOfProject = _db.updateCodeTextOfProject.bind(_db);
export const assetData = _db.assetData.bind(_db);
export const deleteProject = _db.deleteProject.bind(_db);
