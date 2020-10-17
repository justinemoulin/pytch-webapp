import { Action, action, Actions, Thunk, thunk } from "easy-peasy";
import { IModalUserInteraction, modalUserInteraction } from ".";
import { delaySeconds } from "../../utils";

interface IDownloadZipfileDescriptor {
  data: Uint8Array;
}

type IDownloadZipfileBase = IModalUserInteraction<IDownloadZipfileDescriptor>;

interface IDownloadZipfileSpecific {
  liveCreationSeqnum: number;
  incrementLiveCreationSeqnum: Action<IDownloadZipfileSpecific>;
  fileContents: Uint8Array | null;
  setFileContents: Action<IDownloadZipfileSpecific, Uint8Array | null>;
  createContents: Thunk<IDownloadZipfileBase & IDownloadZipfileSpecific>;
}

const downloadZipfileSpecific: IDownloadZipfileSpecific = {
  liveCreationSeqnum: 0,
  incrementLiveCreationSeqnum: action((state) => {
    state.liveCreationSeqnum += 1;
  }),

  fileContents: null,
  setFileContents: action((state, fileContents) => {
    state.fileContents = fileContents;
  }),

  createContents: thunk(async (actions, _payload, helpers) => {
    actions.incrementLiveCreationSeqnum();
    actions.setFileContents(null);

    const workingCreationSeqnum = helpers.getState().liveCreationSeqnum;
    console.log("createContents(): working on seqnum", workingCreationSeqnum);

    // TODO: Replace these two lines with real code.
    //
    // TODO: When we get to it, I think a delaySeconds(0.0) will do the
    // job of yielding control back to the caller?
    //
    await delaySeconds(5.0);
    const zipContents = new Uint8Array(24);

    if (workingCreationSeqnum === helpers.getState().liveCreationSeqnum) {
      // We're still interested in this result; deploy it.
      actions.setFileContents(zipContents);
      actions.setInputsReady(true);
    } else {
      // Another request was launched while we were busy; just throw
      // away what we've computed.
    }
  }),
};

export type IDownloadZipfileInteraction = IDownloadZipfileBase &
  IDownloadZipfileSpecific;
