import { HttpError } from './http';
import {imageDimensions} from '../../../shared/image-dimensions';
import {gifInfo} from '../../../shared/gif';
/** Validate dimensions before storing or asking a browser to decode an image. */
export function checkImageDimensions(data:Uint8Array,ext:string){
  let dimensions;
  try{dimensions=ext==='gif'?gifInfo(data):imageDimensions(data,ext);}catch(error){throw new HttpError(error instanceof RangeError?413:415,error instanceof Error?error.message:'GIF 파일을 확인해 주세요.');}
  const {width,height}=dimensions;
  if(!width||!height)throw new HttpError(415,'이미지 크기를 확인할 수 없습니다. 이미지를 다시 저장한 뒤 업로드해 주세요.');
  if(width>8192||height>8192||width*height>24000000)throw new HttpError(413,'이미지는 한 변 8,192px, 총 2,400만 픽셀 이하로 올려 주세요.');
  return {width,height};
}
