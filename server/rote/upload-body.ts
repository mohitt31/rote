import { assertBodySize,createError,type H3Event } from 'h3';
export async function readBoundedUpload(event:H3Event,maxBytes:number):Promise<FormData>{
 const contentType=event.req.headers.get('content-type');
 if(!contentType?.toLowerCase().startsWith('multipart/form-data;'))throw createError({statusCode:415,statusMessage:'Expected multipart form data'});
 assertBodySize(event,maxBytes);
 // srvx 1.0.8's body-limit proxy delegates formData() to a Response without headers.
 // Parse its bounded stream with the original multipart boundary explicitly preserved.
 return new Response(event.req.body,{headers:{'Content-Type':contentType}}).formData();
}
