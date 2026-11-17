import { HttpError } from './http';
import {imageDimensions} from '../../../shared/image-dimensions';
/** Validate dimensions before storing or asking a browser to decode an image. */
export function checkImageDimensions(data:Uint8Array,ext:string){
  const {width,height}=imageDimensions(data,ext);
  if(!width||!height)throw new HttpError(415,'이미지 크기를 확인할 수 없습니다. 이미지를 다시 저장한 뒤 업로드해 주세요.');
  if(width>8192||height>8192||width*height>24000000)throw new HttpError(413,'이미지는 한 변 8,192px, 총 2,400만 픽셀 이하로 올려 주세요.');
  return {width,height};
}
