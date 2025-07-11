#!C:/Strawberry/perl/bin/perl.exe   
use strict;
use warnings;
use utf8;
use HTTP::Request;
use LWP::UserAgent;
use JSON;
use CGI;

my $cgi = CGI->new;

if (my $course = $cgi->param('course')) {
    my $session = $cgi->param('session');
    returnCourseXml($course, $session);
} elsif (my $search = $cgi->param('search')) {
    returnSearchResults($search);
} else {
    print $cgi->header('text/plain');
    print "Invalid param";
}

sub returnCourseXml {
    my $url = 'https://api.easi.utoronto.ca/ttb/getPageableCourses';
    my $course = shift;
    my $session = shift;
    my $body = {
        courseCodeAndTitleProps => {
            courseCode => "$course",
            courseTitle => "",
            courseSectionCode => "$session",
            searchCourseDescription => JSON::false,
        },
        departmentProps   => [],
        campuses          => [],
        sessions          => ["20259", "20261", "20259-20261"],
        requirementProps  => [],
        instructor        => "",
        courseLevels      => [],
        deliveryModes     => [],
        dayPreferences    => [],
        timePreferences   => [],
        divisions         => ["ARTSC"],
        creditWeights     => [],
        availableSpace    => JSON::false,
        waitListable      => JSON::false,
        page              => 1,
        pageSize          => 20,
        direction         => "asc"
    };

    my $json = encode_json($body);

    my $ua = LWP::UserAgent->new;
    my $request = HTTP::Request->new(POST => $url);
    $request->header('Content-Type' => 'application/json');
    $request->content($json);

    my $response = $ua->request($request);

    print "Content-Type: text/plain\n\n";

    if ($response->is_success) {
        print $response->decoded_content;
    } else {
        print STDERR "API request failed: " . $response->status_line . "\n";
        print "<error>API request failed</error>";
    }    
}

 sub returnSearchResults {
    my $search = shift;
    my $url = 'https://api.easi.utoronto.ca/ttb/getOptimizedMatchingCourseTitles?term=' . $search . '&divisions=ARTSC&sessions=20259&sessions=20261&sessions=20259-20261&lowerThreshold=50&upperThreshold=200';

    my $ua = LWP::UserAgent->new;
    my $request = HTTP::Request->new(GET => $url);
    $request->header('Accept' => 'application/json');
    
    my $response = $ua->request($request);

    print "Content-Type: application/json\n\n";

    if ($response->is_success) {
        print $response->decoded_content;
    } else {
        print STDERR "Search API request failed: " . $response->status_line . "\n";
        print encode_json({error => 'Search request failed'});
    }
}
