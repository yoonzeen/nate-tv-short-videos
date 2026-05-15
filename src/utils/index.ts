/**
 * @param 페이지 통계
 * @returns
 */
const domainStat = 'm_ndr.nate.com/nateon/nate';
const servicecode = 'mw01';
export const sendPV = () => {
    const image = new Image();
    image.src = `//stat.nate.com/stat/mstat.tiff?cp_url=[${domainStat}??ndrparam1=${servicecode}&ndrparam2=&ndrparam3=&ndrparam4=&ndrbr=&ndrparam6=&ndrparam9=&ndru3=${getCookie('ndrn')}]&t=${getTimestamp()}`;
};
export function getCookie(key: string) {
    let result = null;
    if (typeof document === 'undefined') return;
    const cookie = document.cookie.split(';');
  
    cookie.forEach((item) => {
      item = item.replace(/ /g, '');
  
      const dictionary = item.split('=');
      if (key === dictionary[0]) {
        result = dictionary.slice(1).join('=');
      }
    });
    return result;
}
function getTimestamp() {
const now = new Date();
// 기존 t 파라미터 형식 맞춤: 0514150513572 → MMDDHHmmssSSS
return (now.getMonth()+1).toString().padStart(2,'0')
        + now.getDate().toString().padStart(2,'0')
        + now.getHours().toString().padStart(2,'0')
        + now.getMinutes().toString().padStart(2,'0')
        + now.getSeconds().toString().padStart(2,'0')
        + now.getMilliseconds().toString().padStart(3,'0');
}